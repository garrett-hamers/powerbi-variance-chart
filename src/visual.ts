/*
*  Power BI Visual CLI - Atlyn Variance Chart
*  Free alternative to ZebraBI with IBCS-compliant variance analysis
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import * as d3 from "d3";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;
import DataView = powerbi.DataView;
import IColorPalette = powerbi.extensibility.IColorPalette;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { VisualFormattingSettingsModel } from "./settings";
import { parseDataView, ParsedData, ComparisonType, DataPoint, applyTopN, getVariance, getVariancePct } from "./dataParser";
import { createChart, ChartType, ChartSettings, ChartDimensions, ChartLayout, Rect } from "./charts";
import { IBCSColors, DEFAULT_IBCS_COLORS } from "./utils/colors";
import { formatNumber, formatPercent } from "./utils/formatting";
import { calculateLayout as calculateLayoutEngine, getCommentBoxPosition, LayoutConfig, calculateSmallMultiplesGrid, calculateCellLayout, getSmallMultiplesViewport, SmallMultiplesConfig } from "./layoutEngine";
import { BasicFilter } from "powerbi-models";

export class Visual implements IVisual {
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private chartContainer: d3.Selection<SVGGElement, unknown, null, undefined>;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    
    // Power BI services
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;
    private colorPalette: IColorPalette;
    
    // State
    private dataView: DataView;
    private parsedData: ParsedData | null;
    private selectionIds: ISelectionId[] = [];
    private isHighContrast: boolean = false;
    private highContrastColors: { foreground: string; background: string; } | null = null;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        
        // Initialize Power BI services
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.colorPalette = this.host.colorPalette;
        
        // Check for high contrast mode (safely check if property exists)
        const palette = this.colorPalette as any;
        if (palette && typeof palette.isHighContrast === 'boolean') {
            this.isHighContrast = palette.isHighContrast;
            if (this.isHighContrast && palette.foreground && palette.background) {
                this.highContrastColors = {
                    foreground: palette.foreground.value,
                    background: palette.background.value
                };
            }
        }

        // Allow interactions to be restored on bookmark apply
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.syncSelectionState(ids);
        });

        // Create SVG container
        this.svg = d3.select(this.target)
            .append("svg")
            .classed("varianceChart", true);

        this.chartContainer = this.svg.append("g")
            .classed("chartContainer", true);

        // Handle context menu
        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            this.selectionManager.showContextMenu(
                {},
                { x: event.clientX, y: event.clientY }
            );
        });
    }

    public update(options: VisualUpdateOptions) {
        const startTime = performance.now();
        
        // Signal render started
        this.host.eventService?.renderingStarted(options);

        try {
            // Clear previous content and reset container transform
            this.chartContainer.selectAll("*").remove();
            this.chartContainer.attr("transform", null);
            this.selectionIds = [];

            this.dataView = options.dataViews?.[0];
            if (!this.dataView) {
                this.renderLandingPage();
                this.host.eventService?.renderingFinished(options);
                return;
            }

            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                this.dataView
            );

            // Telemetry check
            const enableTelemetry = this.formattingSettings.interactionCard.enableTelemetry.value;
            if (enableTelemetry) {
                console.group("[Atlyn Variance Chart] Update Cycle");
                console.log("Input Viewport:", options.viewport);
                console.log("DataView Metadata:", this.dataView.metadata);
            }

            // Restore cross-filter state from bookmarks
            const jsonFilters = (options as any).jsonFilters;
            if (jsonFilters && Array.isArray(jsonFilters) && jsonFilters.length > 0) {
                this.crossFilterValues.clear();
                for (const f of jsonFilters) {
                    if (f && f.values && Array.isArray(f.values)) {
                        for (const v of f.values) {
                            this.crossFilterValues.add(String(v));
                        }
                    }
                }
                if (enableTelemetry) {
                    console.log("Restored cross-filter from bookmark:", Array.from(this.crossFilterValues));
                }
            }

            // Use actual container dimensions to avoid Power BI viewport/padding mismatch
            const width = Math.min(options.viewport.width, this.target.clientWidth) || options.viewport.width;
            const height = Math.min(options.viewport.height, this.target.clientHeight) || options.viewport.height;

            this.svg
                .attr("width", width)
                .attr("height", height);

            // Parse data with automatic variance calculations
            const parseStart = performance.now();
            this.parsedData = parseDataView(this.dataView);
            const parseTime = performance.now() - parseStart;

            if (enableTelemetry) {
                console.log("Data Parsing:", {
                    durationMs: parseTime.toFixed(2),
                    dataPoints: this.parsedData?.dataPoints.length,
                    groups: this.parsedData?.groups.length,
                    hasBudget: this.parsedData?.hasBudget,
                    hasPY: this.parsedData?.hasPreviousYear,
                    hasForecast: this.parsedData?.hasForecast,
                    maxValue: this.parsedData?.maxValue
                });
            }

            if (!this.parsedData || this.parsedData.dataPoints.length === 0) {
                this.renderLandingPage();
                if (enableTelemetry) console.groupEnd();
                this.host.eventService?.renderingFinished(options);
                return;
            }

            // Create selection IDs for each data point
            this.createSelectionIds();

            // Get chart type from settings
            let chartType = this.formattingSettings.chartSettingsCard.chartType.value.value as ChartType;
            let comparisonType = this.formattingSettings.chartSettingsCard.comparisonType.value.value as ComparisonType;

            if (enableTelemetry) {
                console.log("Initial Settings:", { chartType, comparisonType });
            }

            // Apply orientation: swap to horizontal equivalent if set
            const orientation = String(this.formattingSettings.chartSettingsCard.orientation.value.value);
            if (orientation === "horizontal") {
                switch (chartType) {
                    case "column":
                    case "columnStacked":
                        chartType = "bar";
                        break;
                    case "variance":
                    case "waterfall":
                    case "combo":
                    case "area":
                        // These don't have horizontal variants, use bar
                        chartType = "bar";
                        break;
                    // bar, lollipop, line, dot already work horizontally or are orientation-agnostic
                }
            } else if (orientation === "vertical" && chartType === "bar") {
                chartType = "column";
            }

            // Auto-detect comparison type if selected one is not available
            if (!this.hasComparisonData(this.parsedData, comparisonType)) {
                const availableComparison = this.getAvailableComparisonType(this.parsedData);
                
                if (availableComparison) {
                    comparisonType = availableComparison;
                } else if (chartType === "variance" || chartType === "waterfall" || chartType === "lollipop" || chartType === "dot") {
                    this.renderNoData("Add Plan, Previous Year, or Forecast field for variance analysis");
                    this.host.eventService?.renderingFinished(options);
                    return;
                }
            }

            // Apply Top N + Others filtering
            const topN = this.formattingSettings.topNCard;
            this.parsedData = applyTopN(this.parsedData, {
                enable: topN.enable.value,
                count: topN.count.value,
                sortBy: String(topN.sortBy.value.value),
                sortDirection: String(topN.sortDirection.value.value),
                showOthers: topN.showOthers.value,
                othersLabel: topN.othersLabel.value || "Others",
                comparisonType: comparisonType
            });

            // Responsive design
            const isResponsive = this.formattingSettings.responsiveCard.enable.value;
            const minChartWidth = this.formattingSettings.responsiveCard.minChartWidth.value;
            let responsiveBreakpoint = "large";
            if (isResponsive) {
                if (width < minChartWidth || height < minChartWidth) responsiveBreakpoint = "small";
                else if (width < minChartWidth * 2.5 || height < minChartWidth * 2) responsiveBreakpoint = "medium";
            }

            // Build comprehensive chart settings
            const fontColor = this.isHighContrast 
                ? this.highContrastColors!.foreground 
                : this.formattingSettings.categoriesCard.fontColor.value.value;

            const chartSettings: ChartSettings = {
                // Core settings
                invertVariance: this.formattingSettings.chartSettingsCard.invertVariance.value,
                comparisonType: comparisonType,
                colors: this.getColors(),
                
                // Title settings
                title: {
                    show: this.formattingSettings.titleCard.show.value,
                    text: this.formattingSettings.titleCard.titleText.value || "",
                    fontSize: this.formattingSettings.titleCard.fontSize.value,
                    fontColor: this.formattingSettings.titleCard.fontColor.value.value,
                    alignment: this.formattingSettings.titleCard.alignment.value.value as "left" | "center" | "right"
                },
                
                // Data label settings
                dataLabels: {
                    show: this.formattingSettings.dataLabelsCard.show.value,
                    showValues: this.formattingSettings.dataLabelsCard.showValues.value,
                    showVariance: this.formattingSettings.dataLabelsCard.showVariance.value,
                    showPercentage: this.formattingSettings.dataLabelsCard.showPercentage.value,
                    fontSize: this.formattingSettings.dataLabelsCard.fontSize.value,
                    decimalPlaces: this.formattingSettings.dataLabelsCard.decimalPlaces.value,
                    displayUnits: this.formattingSettings.dataLabelsCard.displayUnits.value.value as any,
                    negativeFormat: String(this.formattingSettings.dataLabelsCard.negativeFormat.value.value) as "minus" | "parentheses",
                    labelDensity: String(this.formattingSettings.dataLabelsCard.labelDensity.value.value) as "all" | "firstLast" | "minMax" | "none"
                },
                
                // Category settings
                categories: {
                    show: this.formattingSettings.categoriesCard.show.value,
                    fontSize: this.formattingSettings.categoriesCard.fontSize.value,
                    fontColor: fontColor,
                    rotation: parseInt(String(this.formattingSettings.categoriesCard.rotation.value.value)) || -45,
                    maxWidth: this.formattingSettings.categoriesCard.maxWidth.value
                },
                
                // Legend settings
                legend: {
                    show: this.formattingSettings.legendCard.show.value,
                    position: String(this.formattingSettings.legendCard.position.value.value) as "top" | "bottom" | "left" | "right",
                    fontSize: this.formattingSettings.legendCard.fontSize.value
                },

                // Comment box settings
                commentBox: {
                    show: this.formattingSettings.commentBoxCard.show.value,
                    showVariance: String(this.formattingSettings.commentBoxCard.showVariance.value.value),
                    varianceIcon: String(this.formattingSettings.commentBoxCard.varianceIcon.value.value),
                    padding: this.formattingSettings.commentBoxCard.padding.value,
                    gap: this.formattingSettings.commentBoxCard.gap.value,
                    fontSize: this.formattingSettings.commentBoxCard.fontSize.value,
                    fontColor: this.formattingSettings.commentBoxCard.fontColor.value.value,
                    markerSize: this.formattingSettings.commentBoxCard.markerSize.value,
                    markerColor: this.formattingSettings.commentBoxCard.markerColor.value.value
                },
                
                // Difference highlighting
                highlighting: {
                    show: this.formattingSettings.differenceHighlightingCard.show.value,
                    threshold: this.formattingSettings.differenceHighlightingCard.threshold.value,
                    highlightPositive: this.formattingSettings.differenceHighlightingCard.highlightPositive.value,
                    highlightNegative: this.formattingSettings.differenceHighlightingCard.highlightNegative.value
                },

                // Axis break
                axisBreak: {
                    show: this.formattingSettings.axisBreakCard.show.value,
                    breakValue: this.formattingSettings.axisBreakCard.breakValue.value
                },
                
                // Legacy compatibility
                showVarianceLabels: this.formattingSettings.dataLabelsCard.showVariance.value,
                showPercentage: this.formattingSettings.dataLabelsCard.showPercentage.value,
                fontSize: this.formattingSettings.dataLabelsCard.fontSize.value,
                fontColor: fontColor
            };

            // Apply responsive overrides
            if (responsiveBreakpoint === "small") {
                chartSettings.title.show = false;
                chartSettings.legend.show = false;
                chartSettings.dataLabels.show = false;
                chartSettings.commentBox.show = false;
                chartSettings.categories.fontSize = Math.min(chartSettings.categories.fontSize, 8);
                chartSettings.categories.rotation = -90;
                chartSettings.axisBreak.show = false;
            } else if (responsiveBreakpoint === "medium") {
                chartSettings.legend.show = false;
                chartSettings.commentBox.show = false;
                chartSettings.dataLabels.fontSize = Math.min(chartSettings.dataLabels.fontSize, 9);
                chartSettings.categories.fontSize = Math.min(chartSettings.categories.fontSize, 9);
                chartSettings.title.fontSize = Math.min(chartSettings.title.fontSize, 12);
            }

            // Build dimensions and layout
            let dimensions: ChartDimensions;
            if (this.parsedData.hasGroups && this.parsedData.groups.length > 1) {
                // Small multiples: compute peripheral space first, then render grid in remaining area
                if (enableTelemetry) console.log("Rendering Small Multiples", { groups: this.parsedData.groups });
                dimensions = { width, height, margin: { top: 0, right: 0, bottom: 0, left: 0 } };

                const layoutConfig: LayoutConfig = {
                    title: { show: chartSettings.title.show },
                    legend: { show: chartSettings.legend.show, position: chartSettings.legend.position },
                    commentBox: { show: chartSettings.commentBox.show },
                    categories: chartSettings.categories,
                    hasComments: this.parsedData.hasComments,
                    chartType,
                    breakpoint: responsiveBreakpoint
                };

                this.renderSmallMultiples(chartType, chartSettings, layoutConfig, width, height);
            } else {
                // Standard chart layout
                dimensions = this.calculateLayout(width, height, chartType, responsiveBreakpoint);
                
                // Create and render chart
                if (enableTelemetry) console.log("Rendering Standard Chart", { chartType, dimensions });
                const chart = createChart(chartType, this.chartContainer, this.parsedData, chartSettings, dimensions);
                chart.render();

                // Check for cross-highlighting
                const hasHighlights = this.dataView?.categorical?.values?.some(v => v.highlights != null) || false;
                if (hasHighlights && this.dataView?.categorical?.values) {
                    const highlights = this.dataView.categorical.values[0]?.highlights;
                    if (highlights) {
                        this.chartContainer.selectAll("rect, circle").each(function(d, i) {
                            const el = d3.select(this);
                            if (i < highlights.length && highlights[i] == null) {
                                el.style("opacity", "0.3");
                            }
                        });
                    }
                }

                // Add interactivity after rendering
                this.addInteractivity(chartType, comparisonType);

                // Show drill-up button if drilled down
                if (this.formattingSettings.interactionCard.enableDrilldown.value) {
                    this.renderDrillUpButton();
                }
            }

            // Signal render finished
            const renderTime = performance.now() - startTime;
            if (enableTelemetry) {
                console.log("Render Complete", { totalDurationMs: renderTime.toFixed(2) });
                console.groupEnd();
            }
            this.host.eventService?.renderingFinished(options);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (this.formattingSettings?.interactionCard?.enableTelemetry?.value) {
                console.error("Render Failed:", error);
                console.groupEnd();
            }
            this.host.eventService?.renderingFailed(options, errorMessage);
            throw error;
        }
    }

    private createSelectionIds(): void {
        if (!this.dataView?.categorical?.categories?.[0]) return;

        const category = this.dataView.categorical.categories[0];
        this.selectionIds = [];

        for (let i = 0; i < category.values.length; i++) {
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(category, i)
                .createSelectionId();
            this.selectionIds.push(selectionId);
        }
    }

    private addInteractivity(chartType: ChartType, comparisonType: ComparisonType): void {
        const interactionSettings = this.formattingSettings.interactionCard;
        const self = this;
        const dataPointCount = this.parsedData?.dataPoints.length || 1;

        // Tag ALL visual elements (rect and circle) with data-index
        // For charts with multiple rects per data point (e.g., variance has 3 bars per category),
        // we use modulo to map back to the data point index
        let elementIndex = 0;
        this.chartContainer.selectAll("rect").each(function() {
            const el = d3.select(this);
            // Skip axis/background rects (those without fill or white fill)
            const fill = el.attr("fill");
            if (fill && fill !== "none" && fill !== "white" && fill !== "#fff") {
                el.attr("data-index", String(elementIndex));
                el.style("cursor", interactionSettings.enableSelection.value ? "pointer" : "default");
                elementIndex++;
            }
        });

        let circleElementIndex = 0;
        this.chartContainer.selectAll("circle").each(function() {
            const el = d3.select(this);
            // Skip comment marker circles — they have their own interaction
            if (el.classed("comment-marker") || el.classed("comment-card-marker")) return;
            el.attr("data-index", String(circleElementIndex))
              .style("cursor", interactionSettings.enableSelection.value ? "pointer" : "default");
            circleElementIndex++;
        });

        // Selection click handlers
        if (interactionSettings.enableSelection.value) {
            const crossFilterMode = String(interactionSettings.crossFilterMode.value.value);

            this.chartContainer.selectAll("rect[data-index], circle[data-index]")
                .on("click", function(event: MouseEvent) {
                    event.stopPropagation();
                    const indexStr = d3.select(this).attr("data-index");
                    if (indexStr == null) return;
                    const dpIndex = parseInt(indexStr) % dataPointCount;
                    if (dpIndex >= 0 && dpIndex < self.selectionIds.length) {
                        const isMultiSelect = event.ctrlKey || event.metaKey;
                        self.selectionManager.select(self.selectionIds[dpIndex], isMultiSelect)
                            .then((ids: ISelectionId[]) => {
                                self.syncSelectionState(ids);
                            });

                        // Cross-filter mode: apply a BasicFilter to filter other visuals
                        if (crossFilterMode === "filter") {
                            self.applyCrossFilter(dpIndex, isMultiSelect);
                        }
                    }
                    // Highlight the matching comment card and marker
                    self.highlightComment(dpIndex);
                });

            // Click on empty space to clear selection
            this.svg.on("click", function(event: MouseEvent) {
                if ((event.target as Element).tagName === "svg" || 
                    d3.select(event.target as Element).attr("data-index") == null) {
                    self.selectionManager.clear().then(() => {
                        self.syncSelectionState([]);
                    });
                    self.highlightComment(-1);
                    // Clear cross-filter
                    if (crossFilterMode === "filter") {
                        self.clearCrossFilter();
                    }
                }
            });
        }

        // Tooltip handlers
        if (interactionSettings.enableTooltips.value) {
            this.chartContainer.selectAll("rect[data-index], circle[data-index]")
                .on("mouseover", function(event: MouseEvent) {
                    const indexStr = d3.select(this).attr("data-index");
                    if (indexStr == null) return;
                    const dpIndex = parseInt(indexStr) % dataPointCount;
                    const dp = self.parsedData?.dataPoints[dpIndex];
                    if (!dp) return;

                    const tooltipData = self.buildTooltipForDataPoint(dp, comparisonType);
                    self.tooltipService.show({
                        dataItems: tooltipData,
                        identities: dpIndex < self.selectionIds.length ? [self.selectionIds[dpIndex]] : [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                })
                .on("mousemove", function(event: MouseEvent) {
                    const indexStr = d3.select(this).attr("data-index");
                    if (indexStr == null) return;
                    const dpIndex = parseInt(indexStr) % dataPointCount;
                    const dp = self.parsedData?.dataPoints[dpIndex];
                    if (!dp) return;

                    const tooltipData = self.buildTooltipForDataPoint(dp, comparisonType);
                    self.tooltipService.move({
                        dataItems: tooltipData,
                        identities: dpIndex < self.selectionIds.length ? [self.selectionIds[dpIndex]] : [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                })
                .on("mouseout", function() {
                    self.tooltipService.hide({
                        immediately: true,
                        isTouchEvent: false
                    });
                });
        }

        // Drilldown support
        if (interactionSettings.enableDrilldown.value) {
            this.chartContainer.selectAll("rect[data-index], circle[data-index]")
                .on("dblclick", function(event: MouseEvent) {
                    event.stopPropagation();
                    const indexStr = d3.select(this).attr("data-index");
                    if (indexStr == null) return;
                    const dpIndex = parseInt(indexStr) % dataPointCount;
                    if (dpIndex >= 0 && dpIndex < self.selectionIds.length) {
                        self.selectionManager.select(self.selectionIds[dpIndex], false);
                        self.triggerDrill(powerbi.DrillType?.Down ?? 0);
                    }
                });
        }
    }

    private syncSelectionState(selectionIds: ISelectionId[]): void {
        const hasSelection = selectionIds.length > 0;
        this.chartContainer.selectAll("rect[data-index], circle[data-index]").each(function() {
            const el = d3.select(this);
            el.style("opacity", hasSelection ? "0.3" : "1");
        });
        // Comment markers and cards always stay fully visible
        this.chartContainer.selectAll(".comment-marker, .comment-marker-text, .comment-card-marker, .comment-box")
            .style("opacity", "1");
        // If we have selections, make matching elements opaque
        if (hasSelection) {
            const dataPointCount = this.parsedData?.dataPoints.length || 1;
            // Build set of selected data point indices
            const selectedDpIndices = new Set<number>();
            for (const sid of selectionIds) {
                for (let i = 0; i < this.selectionIds.length; i++) {
                    // Compare by reference since Power BI returns the same IDs
                    if (this.selectionIds[i] === sid) {
                        selectedDpIndices.add(i);
                    }
                }
            }
            // If reference comparison didn't work, use index-based approach
            if (selectedDpIndices.size === 0 && selectionIds.length > 0) {
                // Fallback: assume first N data points are selected
                for (let i = 0; i < Math.min(selectionIds.length, dataPointCount); i++) {
                    selectedDpIndices.add(i);
                }
            }
            this.chartContainer.selectAll("rect[data-index], circle[data-index]").each(function() {
                const el = d3.select(this);
                const indexStr = el.attr("data-index");
                if (indexStr != null) {
                    const dpIndex = parseInt(indexStr) % dataPointCount;
                    if (selectedDpIndices.has(dpIndex)) {
                        el.style("opacity", "1");
                    }
                }
            });
        }
    }

    /**
     * Highlight the comment card and marker corresponding to a data point index.
     * Pass -1 to clear all highlights.
     */
    private highlightComment(dataPointIndex: number): void {
        // Reset all comment markers and cards to default
        this.chartContainer.selectAll(".comment-marker")
            .attr("stroke-width", 1.5)
            .attr("fill", "none");
        this.chartContainer.selectAll(".comment-card-marker")
            .attr("stroke-width", 1.5)
            .attr("fill", "none");

        if (dataPointIndex < 0) return;

        // Highlight matching comment markers on chart
        this.chartContainer.selectAll(`.comment-marker[data-comment-index="${dataPointIndex}"]`)
            .attr("stroke-width", 3)
            .attr("fill", "rgba(26, 115, 232, 0.15)");

        // Highlight matching comment card markers
        this.chartContainer.selectAll(`.comment-card-marker[data-comment-index="${dataPointIndex}"]`)
            .attr("stroke-width", 3)
            .attr("fill", "rgba(26, 115, 232, 0.15)");
    }

    // ─── Cross-Filter ───

    /** Track selected category values for multi-select cross-filtering */
    private crossFilterValues: Set<string> = new Set();

    private applyCrossFilter(dpIndex: number, isMultiSelect: boolean): void {
        const category = this.dataView?.categorical?.categories?.[0];
        if (!category?.source) return;

        const dp = this.parsedData?.dataPoints[dpIndex];
        if (!dp) return;

        if (!isMultiSelect) {
            this.crossFilterValues.clear();
        }
        this.crossFilterValues.add(dp.category);

        const queryName = category.source.queryName || "";
        const tableName = queryName.includes(".") ? queryName.substring(0, queryName.indexOf(".")) : queryName;
        const columnName = category.source.displayName || "";

        try {
            const filter = new BasicFilter(
                { table: tableName, column: columnName },
                "In",
                Array.from(this.crossFilterValues)
            );
            (this.host as any).applyJsonFilter(filter, "general", "filter", 1 /* FilterAction.merge */);
        } catch (e) {
            // Filter API may not be available in all environments
            console.warn("[Atlyn] Cross-filter failed:", e);
        }
    }

    private clearCrossFilter(): void {
        this.crossFilterValues.clear();
        try {
            (this.host as any).applyJsonFilter(null, "general", "filter", 0 /* FilterAction.remove */);
        } catch (e) {
            console.warn("[Atlyn] Clear cross-filter failed:", e);
        }
    }

    // ─── Drill ───

    private triggerDrill(drillType: number): void {
        try {
            (this.host as any).drill?.({
                roleName: "category",
                drillType: drillType
            });
        } catch (e) {
            console.warn("[Atlyn] Drill failed:", e);
        }
    }

    /**
     * Render a drill-up button when the visual is in a drilled-down state.
     * Detects drill state by checking if category hierarchy depth > 1.
     */
    private renderDrillUpButton(): void {
        const category = this.dataView?.categorical?.categories?.[0];
        if (!category?.source) return;

        // Check if drillable — the category must have drill roles defined
        const metadata = this.dataView?.metadata;
        const drillableRoles = (metadata as any)?.dataRoles?.drillableRoles;
        // Also check if category level > 0 (meaning we've drilled into something)
        const categoryLevel = (category.source as any).roles?.category ? 
            Object.keys(category.source as any).length : 0;

        // A simple heuristic: if the queryName contains multiple dots or 
        // if there are grouping levels, we're likely drilled down
        const queryName = category.source.queryName || "";
        const isDrilledDown = queryName.split(".").length > 2;

        if (!isDrilledDown && !drillableRoles) return;
        if (!isDrilledDown) return;

        const self = this;
        const drillUpGroup = this.chartContainer.append("g")
            .attr("class", "drill-up-button")
            .attr("transform", "translate(0, -10)")
            .style("cursor", "pointer")
            .on("click", function() {
                self.triggerDrill(1 /* DrillType.Up */);
            });

        drillUpGroup.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("font-size", "11px")
            .attr("fill", "#1a73e8")
            .text("↑ Drill Up");
    }

    private buildTooltipForDataPoint(dp: DataPoint, comparisonType: ComparisonType): VisualTooltipDataItem[] {
        const tooltipItems: VisualTooltipDataItem[] = [
            { displayName: "Category", value: dp.category },
            { displayName: "Actual", value: formatNumber(dp.actual, { scale: "auto" }) }
        ];

        if (this.parsedData?.hasBudget) {
            tooltipItems.push(
                { displayName: "Budget", value: formatNumber(dp.budget, { scale: "auto" }) },
                { displayName: "Variance to Budget", value: `${dp.varianceToBudget >= 0 ? "+" : ""}${formatNumber(dp.varianceToBudget, { scale: "auto" })} (${dp.varianceToBudgetPct.toFixed(1)}%)` }
            );
        }
        if (this.parsedData?.hasPreviousYear) {
            tooltipItems.push(
                { displayName: "Previous Year", value: formatNumber(dp.previousYear, { scale: "auto" }) },
                { displayName: "YoY Change", value: `${dp.varianceToPY >= 0 ? "+" : ""}${formatNumber(dp.varianceToPY, { scale: "auto" })} (${dp.varianceToPYPct.toFixed(1)}%)` }
            );
        }
        if (this.parsedData?.hasForecast) {
            tooltipItems.push(
                { displayName: "Forecast", value: formatNumber(dp.forecast, { scale: "auto" }) }
            );
        }
        if (dp.comment) {
            tooltipItems.push({ displayName: "Comment", value: dp.comment });
        }

        return tooltipItems;
    }

    private hasComparisonData(data: ParsedData, comparisonType: ComparisonType): boolean {
        switch (comparisonType) {
            case "budget": return data.hasBudget;
            case "previousYear": return data.hasPreviousYear;
            case "forecast": return data.hasForecast;
            default: return data.hasBudget;
        }
    }

    private getAvailableComparisonType(data: ParsedData): ComparisonType | null {
        // Priority: Previous Year > Plan > Forecast
        if (data.hasPreviousYear) return "previousYear";
        if (data.hasBudget) return "budget";
        if (data.hasForecast) return "forecast";
        return null;
    }

    private getComparisonLabel(comparisonType: ComparisonType): string {
        switch (comparisonType) {
            case "previousYear": return "Previous Year";
            case "forecast": return "Forecast";
            default: return "Budget/Plan";
        }
    }

    private calculateLayout(width: number, height: number, chartType: ChartType, breakpoint: string = "large"): ChartDimensions {
        const enableTelemetry = this.formattingSettings.interactionCard.enableTelemetry.value;

        const config: LayoutConfig = {
            title: { show: this.formattingSettings.titleCard.show.value },
            legend: {
                show: this.formattingSettings.legendCard.show.value,
                position: String(this.formattingSettings.legendCard.position.value.value) as any
            },
            commentBox: {
                show: this.formattingSettings.commentBoxCard.show.value
            },
            categories: {
                show: this.formattingSettings.categoriesCard.show.value,
                rotation: parseInt(String(this.formattingSettings.categoriesCard.rotation.value.value)) || -45,
                maxWidth: this.formattingSettings.categoriesCard.maxWidth.value,
                fontSize: this.formattingSettings.categoriesCard.fontSize.value
            },
            hasComments: this.parsedData?.hasComments || false,
            chartType,
            breakpoint
        };

        const result = calculateLayoutEngine(width, height, config);

        // Telemetry
        if (enableTelemetry) {
            console.log("[Atlyn Variance Chart] Layout Telemetry:", {
                viewport: { width, height },
                config,
                margins: result.margin,
                layoutAreas: result.layout,
                chartWidth: width - result.margin.left - result.margin.right,
                chartHeight: height - result.margin.top - result.margin.bottom
            });
        }

        return result;
    }

    private renderSmallMultiples(chartType: ChartType, chartSettings: ChartSettings, layoutConfig: LayoutConfig, totalWidth: number, totalHeight: number): void {
        const groups = this.parsedData.groups;
        const smSettings = this.formattingSettings.smallMultiplesCard;
        const enableTelemetry = this.formattingSettings.interactionCard.enableTelemetry.value;

        // Compute viewport for grid after peripherals carve their space
        const vp = getSmallMultiplesViewport(totalWidth, totalHeight, layoutConfig);

        const smConfig: SmallMultiplesConfig = {
            columns: smSettings.columns.value,
            spacing: smSettings.spacing.value,
            showHeaders: smSettings.showHeaders.value,
            categoryRotation: parseInt(String(this.formattingSettings.categoriesCard.rotation.value.value)) || -45,
            categoryMaxWidth: this.formattingSettings.categoriesCard.maxWidth.value,
            categoryFontSize: this.formattingSettings.categoriesCard.fontSize.value,
        };

        const grid = calculateSmallMultiplesGrid(vp.width, vp.height, groups.length, smConfig);

        if (enableTelemetry) {
            console.group("Small Multiples Layout");
            console.log("Viewport (after peripherals)", vp);
            console.log("Grid Config", grid);
        }

        // Find shared scale if needed
        const scaleMode = String(smSettings.scaleMode.value.value);
        let sharedMax = 0;
        if (scaleMode === "shared") {
            this.parsedData.dataPoints.forEach(d => {
                sharedMax = Math.max(sharedMax, d.actual, d.budget, d.previousYear, d.forecast);
            });
        }

        groups.forEach((group, i) => {
            const cell = calculateCellLayout(grid, i, smConfig);

            if (enableTelemetry) {
                console.log(`Cell [${i}] (${group})`, cell);
            }

            // Filter data for this group
            const groupData: ParsedData = {
                ...this.parsedData,
                dataPoints: this.parsedData.dataPoints.filter(d => d.group === group),
                maxValue: sharedMax > 0 ? sharedMax : undefined
            };

            // Nested <svg> creates an isolated, clipped viewport
            // Position is offset by the peripheral viewport origin
            const cellSvg = this.chartContainer.append("svg")
                .attr("x", vp.x + cell.x)
                .attr("y", vp.y + cell.y)
                .attr("width", grid.cellWidth)
                .attr("height", grid.cellHeight)
                .attr("overflow", "hidden");

            // Header
            if (smConfig.showHeaders) {
                cellSvg.append("text")
                    .attr("x", grid.cellWidth / 2)
                    .attr("y", 14)
                    .attr("text-anchor", "middle")
                    .attr("font-size", "11px")
                    .attr("font-weight", "bold")
                    .attr("fill", "#333")
                    .text(group);
            }

            // Chart group within the nested SVG
            const chartGroup = cellSvg.append("g")
                .attr("transform", `translate(0, ${cell.headerHeight})`) as any as d3.Selection<SVGGElement, unknown, null, undefined>;

            const cellDimensions: ChartDimensions = {
                width: grid.cellWidth,
                height: grid.cellHeight - cell.headerHeight,
                margin: cell.margin
            };

            // Disable legend/comments/title in small multiples cells (rendered at outer level)
            const cellSettings: ChartSettings = {
                ...chartSettings,
                legend: { ...chartSettings.legend, show: false },
                commentBox: { ...chartSettings.commentBox, show: false },
                title: { ...chartSettings.title, show: false },
                axisBreak: { ...chartSettings.axisBreak, show: false }
            };

            const chart = createChart(chartType, chartGroup, groupData, cellSettings, cellDimensions);
            chart.render();
        });

        // Render outer-level title
        if (chartSettings.title.show && chartSettings.title.text) {
            const titleX = chartSettings.title.alignment === "center" ? totalWidth / 2
                : chartSettings.title.alignment === "right" ? totalWidth - 10 : 10;
            const anchor = chartSettings.title.alignment === "center" ? "middle"
                : chartSettings.title.alignment === "right" ? "end" : "start";
            this.chartContainer.append("text")
                .attr("class", "chart-title")
                .attr("x", titleX)
                .attr("y", 20)
                .attr("text-anchor", anchor)
                .attr("font-size", `${chartSettings.title.fontSize}px`)
                .attr("font-weight", "bold")
                .attr("fill", chartSettings.title.fontColor)
                .text(chartSettings.title.text);
        }

        // Render outer-level legend
        if (chartSettings.legend.show) {
            const legendItems = this.buildLegendItems(chartType, chartSettings);
            const legendGroup = this.chartContainer.append("g").attr("class", "legend");
            const pos = chartSettings.legend.position;
            let lx: number, ly: number;
            if (pos === "right") {
                lx = vp.x + vp.width + 10;
                ly = vp.y + 10;
            } else if (pos === "left") {
                lx = 5;
                ly = vp.y + 10;
            } else if (pos === "top") {
                lx = totalWidth / 2 - (legendItems.length * 70) / 2;
                ly = vp.y - 20;
            } else {
                lx = totalWidth / 2 - (legendItems.length * 70) / 2;
                ly = vp.y + vp.height + 5;
            }
            legendGroup.attr("transform", `translate(${lx}, ${ly})`);

            const direction: "horizontal" | "vertical" =
                (pos === "top" || pos === "bottom") ? "horizontal" : "vertical";

            legendItems.forEach((item, i) => {
                const ix = direction === "horizontal" ? i * 70 : 0;
                const iy = direction === "horizontal" ? 0 : i * 20;
                if (item.outlined) {
                    legendGroup.append("rect")
                        .attr("x", ix).attr("y", iy)
                        .attr("width", 12).attr("height", 12)
                        .attr("fill", "none")
                        .attr("stroke", item.color).attr("stroke-width", 2)
                        .attr("stroke-dasharray", "3,1");
                } else {
                    legendGroup.append("rect")
                        .attr("x", ix).attr("y", iy)
                        .attr("width", 12).attr("height", 12)
                        .attr("fill", item.color);
                }
                legendGroup.append("text")
                    .attr("x", ix + 18).attr("y", iy + 10)
                    .attr("font-size", `${chartSettings.legend.fontSize}px`)
                    .attr("fill", "#333")
                    .text(item.label);
            });
        }

        // Render outer-level comment box
        if (chartSettings.commentBox.show && this.parsedData.hasComments) {
            const comments = this.parsedData.dataPoints
                .map((d, i) => ({ dp: d, index: i }))
                .filter(({ dp }) => dp.comment && dp.comment.trim() !== "");

            if (comments.length > 0) {
                const cbX = vp.x + vp.width + 10;
                const cbY = chartSettings.legend.show && chartSettings.legend.position === "right"
                    ? vp.y + Math.min(comments.length, 3) * 20 + 30
                    : vp.y;
                const cbWidth = 200;
                const cbHeight = totalHeight - cbY;

                const { commentBox: cbSettings } = chartSettings;
                const markerSize = cbSettings.markerSize || 18;
                const fontSize = cbSettings.fontSize;
                const padding = cbSettings.padding;

                // Use foreignObject for native scrollbar
                const fo = this.chartContainer.append("foreignObject")
                    .attr("class", "comment-box")
                    .attr("x", cbX)
                    .attr("y", cbY)
                    .attr("width", cbWidth)
                    .attr("height", Math.max(cbHeight, 60));

                const scrollDiv = fo.append("xhtml:div")
                    .style("width", `${cbWidth}px`)
                    .style("height", `${Math.max(cbHeight, 60)}px`)
                    .style("overflow-y", "auto")
                    .style("overflow-x", "hidden")
                    .style("font-family", "\"Segoe UI\", sans-serif")
                    .style("box-sizing", "border-box");

                comments.forEach(({ dp, index }, cardIndex) => {
                    const markerNum = cardIndex + 1;
                    const variance = getVariance(dp, chartSettings.comparisonType);
                    const variancePct = getVariancePct(dp, chartSettings.comparisonType);
                    const isPositive = (chartSettings.invertVariance ? -variance : variance) >= 0;

                    const card = scrollDiv.append("xhtml:div")
                        .style("display", "flex")
                        .style("align-items", "flex-start")
                        .style("gap", `${padding}px`)
                        .style("margin-bottom", `${cbSettings.gap}px`)
                        .style("padding", `${padding}px 0`);

                    // Numbered circle marker
                    card.append("xhtml:div")
                        .attr("class", "comment-card-marker")
                        .attr("data-comment-index", String(index))
                        .style("min-width", `${markerSize}px`)
                        .style("width", `${markerSize}px`)
                        .style("height", `${markerSize}px`)
                        .style("border-radius", "50%")
                        .style("border", `1.5px solid ${cbSettings.markerColor}`)
                        .style("display", "flex")
                        .style("align-items", "center")
                        .style("justify-content", "center")
                        .style("font-size", `${fontSize}px`)
                        .style("font-weight", "bold")
                        .style("color", cbSettings.markerColor)
                        .style("flex-shrink", "0")
                        .text(String(markerNum));

                    // Content column
                    const content = card.append("xhtml:div")
                        .style("flex", "1")
                        .style("min-width", "0");

                    // Line 1: Category + group label
                    const label = dp.group ? `${dp.group}, ${dp.category}` : dp.category;
                    content.append("xhtml:div")
                        .style("font-size", `${fontSize + 1}px`)
                        .style("font-weight", "bold")
                        .style("color", cbSettings.fontColor)
                        .style("line-height", "1.3")
                        .text(label);

                    // Line 2: Value + variance + icon
                    let valueText = formatNumber(dp.actual);
                    if (cbSettings.showVariance === "absolute" || cbSettings.showVariance === "both") {
                        valueText += ` ${formatNumber(chartSettings.invertVariance ? -variance : variance)}`;
                    }
                    if (cbSettings.showVariance === "relative" || cbSettings.showVariance === "both") {
                        const pctVal = chartSettings.invertVariance ? -variancePct : variancePct;
                        valueText += ` ${formatPercent(pctVal, 1, true)}`;
                    }

                    const valueLine = content.append("xhtml:div")
                        .style("font-size", `${fontSize}px`)
                        .style("color", "#333")
                        .style("line-height", "1.4");

                    valueLine.append("xhtml:span").text(valueText);

                    if (cbSettings.varianceIcon !== "none" && cbSettings.showVariance !== "none") {
                        let icon = "";
                        if (cbSettings.varianceIcon === "triangle") icon = isPositive ? " \u25B2" : " \u25BC";
                        else if (cbSettings.varianceIcon === "arrow") icon = isPositive ? " \u2191" : " \u2193";
                        else if (cbSettings.varianceIcon === "circle") icon = " \u25CF";

                        const iconColor = isPositive
                            ? chartSettings.colors.positiveVariance
                            : chartSettings.colors.negativeVariance;
                        valueLine.append("xhtml:span")
                            .attr("class", "variance-icon")
                            .style("color", iconColor)
                            .style("font-size", `${fontSize + 2}px`)
                            .text(icon);
                    }

                    // Comment text
                    if (dp.comment) {
                        content.append("xhtml:div")
                            .style("font-size", `${fontSize - 1}px`)
                            .style("color", "#666")
                            .style("line-height", "1.4")
                            .style("word-wrap", "break-word")
                            .text(dp.comment.trim());
                    }
                });
            }
        }

        if (enableTelemetry) console.groupEnd();
    }

    private buildLegendItems(chartType: ChartType, settings: ChartSettings): Array<{ label: string; color: string; outlined?: boolean }> {
        const compLabel = settings.comparisonType === "previousYear" ? "Previous Year"
            : settings.comparisonType === "forecast" ? "Forecast" : "Budget";
        const compColor = settings.comparisonType === "previousYear" ? settings.colors.previousYear
            : settings.comparisonType === "forecast" ? settings.colors.forecast : settings.colors.budget;

        if (chartType === "variance" || chartType === "waterfall") {
            return [
                { label: compLabel, color: compColor, outlined: true },
                { label: "Actual", color: settings.colors.actual },
                { label: "+Variance", color: settings.colors.positiveVariance },
                { label: "-Variance", color: settings.colors.negativeVariance }
            ];
        }
        return [
            { label: "Actual", color: settings.colors.actual },
            { label: compLabel, color: compColor, outlined: true }
        ];
    }

    private getColors(): IBCSColors {
        // Use high contrast colors if enabled
        if (this.isHighContrast && this.highContrastColors) {
            return {
                actual: this.highContrastColors.foreground,
                budget: this.highContrastColors.foreground,
                previousYear: this.highContrastColors.foreground,
                forecast: this.highContrastColors.foreground,
                positiveVariance: this.highContrastColors.foreground,
                negativeVariance: this.highContrastColors.foreground
            };
        }

        const colors = this.formattingSettings.ibcsColorsCard;
        return {
            actual: colors.actualColor.value.value || DEFAULT_IBCS_COLORS.actual,
            budget: colors.budgetColor.value.value || DEFAULT_IBCS_COLORS.budget,
            previousYear: colors.previousYearColor.value.value || DEFAULT_IBCS_COLORS.previousYear,
            forecast: colors.forecastColor.value.value || DEFAULT_IBCS_COLORS.forecast,
            positiveVariance: colors.positiveVarianceColor.value.value || DEFAULT_IBCS_COLORS.positiveVariance,
            negativeVariance: colors.negativeVarianceColor.value.value || DEFAULT_IBCS_COLORS.negativeVariance
        };
    }

    private renderLandingPage(): void {
        const width = parseInt(this.svg.attr("width")) || 300;
        const height = parseInt(this.svg.attr("height")) || 200;

        // Landing page background
        this.chartContainer.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", this.isHighContrast ? this.highContrastColors?.background || "#fff" : "#fafafa");

        // Icon representation
        const iconGroup = this.chartContainer.append("g")
            .attr("transform", `translate(${width/2 - 40}, ${height/2 - 50})`);

        // Mini chart icon
        iconGroup.append("rect").attr("x", 0).attr("y", 40).attr("width", 15).attr("height", 30).attr("fill", "#ccc");
        iconGroup.append("rect").attr("x", 20).attr("y", 20).attr("width", 15).attr("height", 50).attr("fill", "#404040");
        iconGroup.append("rect").attr("x", 40).attr("y", 50).attr("width", 15).attr("height", 20).attr("fill", "#4CAF50");
        iconGroup.append("rect").attr("x", 60).attr("y", 30).attr("width", 15).attr("height", 40).attr("fill", "#ccc");

        // Title
        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2 + 30)
            .attr("text-anchor", "middle")
            .attr("fill", this.isHighContrast ? this.highContrastColors?.foreground || "#333" : "#333")
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .text("Atlyn Variance Chart");

        // Instructions
        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2 + 50)
            .attr("text-anchor", "middle")
            .attr("fill", this.isHighContrast ? this.highContrastColors?.foreground || "#666" : "#666")
            .attr("font-size", "11px")
            .text("Add Category, Actual, and Budget fields to start");

        // Additional help text
        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2 + 68)
            .attr("text-anchor", "middle")
            .attr("fill", this.isHighContrast ? this.highContrastColors?.foreground || "#888" : "#888")
            .attr("font-size", "10px")
            .text("Use Format pane to switch chart types");
    }

    private renderNoData(message: string): void {
        const width = parseInt(this.svg.attr("width")) || 200;
        const height = parseInt(this.svg.attr("height")) || 100;

        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", this.isHighContrast ? this.highContrastColors?.foreground || "#666" : "#666")
            .attr("font-size", "12px")
            .text(message);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}