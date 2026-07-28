/*
 * Power BI Visualizations - Atlyn Variance Chart
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import * as d3 from "d3";
import {
    BasicFilter,
    TupleFilter,
    FilterType,
    IBasicFilter,
    IFilterColumnTarget,
    ITupleFilter,
    PrimitiveValueType,
    TupleValueType
} from "powerbi-models";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { VisualFormattingSettingsModel } from "./settings";
import {
    applyTopN,
    ComparisonType,
    DataPoint,
    FiniteValue,
    getComparisonValue,
    getDataPointGroupKey,
    getGroupKeys,
    getAvailableComparisonType,
    getVariance,
    getVariancePct,
    MeasureKey,
    ParsedData,
    parseDataView,
    subsetParsedData
} from "./dataParser";
import { ChartDimensions, ChartSettings, ChartType, createChart, getChartValueDomain } from "./charts";
import { IBCSColors } from "./utils/colors";
import { formatModelValue, formatNumber, formatPercent, NumberScale } from "./utils/formatting";
import {
    calculateCellLayout,
    calculateLayout as calculateLayoutEngine,
    calculateSmallMultiplesGrid,
    getSmallMultiplesViewport,
    LayoutConfig,
    Rect as LayoutRect,
    SmallMultiplesConfig
} from "./layoutEngine";

type FilterValue = PrimitiveValueType;
interface FilterTuple {
    category: FilterValue;
    group?: FilterValue;
}
type LegendPosition = "top" | "bottom" | "left" | "right";
const FILTER_MERGE = (powerbi.FilterAction?.merge ?? 0) as powerbi.FilterAction;
const FILTER_REMOVE = (powerbi.FilterAction?.remove ?? 1) as powerbi.FilterAction;
const DRILL_DOWN = (powerbi.DrillType?.Down ?? 2) as powerbi.DrillType;
const DRILL_UP = (powerbi.DrillType?.Up ?? 1) as powerbi.DrillType;
const CHART_TYPES: readonly ChartType[] = [
    "variance", "waterfall", "column", "columnStacked", "bar",
    "line", "area", "combo", "dot", "lollipop"
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFilterValue(value: unknown): value is FilterValue {
    return typeof value === "string"
        || (typeof value === "number" && Number.isFinite(value))
        || typeof value === "boolean";
}

function isColumnTarget(value: unknown): value is IFilterColumnTarget {
    return isRecord(value) && typeof value.table === "string" && typeof value.column === "string";
}

function isBasicFilter(filter: powerbi.IFilter): filter is powerbi.IFilter & IBasicFilter {
    const candidate: unknown = filter;
    return isRecord(candidate)
        && candidate.operator === "In"
        && candidate.filterType === FilterType.Basic
        && isColumnTarget(candidate.target)
        && Array.isArray(candidate.values)
        && candidate.values.every(isFilterValue);
}

function isTupleFilter(filter: powerbi.IFilter): filter is powerbi.IFilter & ITupleFilter {
    const candidate: unknown = filter;
    return isRecord(candidate)
        && candidate.operator === "In"
        && candidate.filterType === FilterType.Tuple
        && Array.isArray(candidate.target)
        && candidate.target.every(isColumnTarget)
        && Array.isArray(candidate.values)
        && candidate.values.every(tuple =>
            Array.isArray(tuple)
            && tuple.every(element => isRecord(element) && isFilterValue(element.value))
        );
}

function isVisualSelectionId(
    selectionId: powerbi.extensibility.ISelectionId
): selectionId is ISelectionId {
    return "equals" in selectionId
        && typeof selectionId.equals === "function"
        && "getKey" in selectionId
        && typeof selectionId.getKey === "function";
}

function finiteDimension(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function finiteSetting(
    value: unknown,
    fallback: number,
    minimum = 0,
    maximum = Number.MAX_VALUE
): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(maximum, Math.max(minimum, value))
        : fallback;
}

function enumSetting<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T
): T {
    return typeof value === "string" && allowed.includes(value as T)
        ? value as T
        : fallback;
}

export class Visual implements IVisual {
    private readonly target: HTMLElement;
    private readonly host: IVisualHost;
    private readonly eventService: IVisualEventService;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly chartContainer: d3.Selection<SVGGElement, unknown, null, undefined>;
    private readonly statusRegion: HTMLDivElement;

    private formattingSettings: VisualFormattingSettingsModel;
    private dataView?: DataView;
    private parsedData: ParsedData | null = null;
    private selectionIds: ISelectionId[] = [];
    private filterTuples = new Map<string, FilterTuple>();
    private focusSourceKey: string | null = null;
    private foreground: string;
    private background: string;
    private selectionColor: string;

    constructor(options?: VisualConstructorOptions) {
        if (!options) throw new Error("Visual constructor options are required.");
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();

        const palette = this.host.colorPalette;
        this.foreground = palette.foreground?.value ?? "#333333";
        this.background = palette.background?.value ?? "#ffffff";
        this.selectionColor = palette.selection?.value ?? palette.foregroundSelected?.value ?? this.foreground;

        this.target.classList.add("atlyn-visual-host");
        this.target.style.overflow = "auto";
        this.target.style.setProperty("--atlyn-foreground", this.foreground);
        this.target.style.setProperty("--atlyn-background", this.background);
        this.target.style.setProperty("--atlyn-selection", this.selectionColor);

        this.statusRegion = document.createElement("div");
        this.statusRegion.className = "atlyn-visually-hidden";
        this.statusRegion.setAttribute("role", "status");
        this.statusRegion.setAttribute("aria-live", "polite");
        this.statusRegion.setAttribute("aria-atomic", "true");
        this.target.appendChild(this.statusRegion);

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("varianceChart", true)
            .classed("high-contrast", palette.isHighContrast === true)
            .attr("role", "group")
            .attr("aria-label", "Atlyn Variance Chart")
            .attr("aria-description", "Interactive variance analysis chart")
            .attr("tabindex", 0);

        this.chartContainer = this.svg.append("g").classed("chartContainer", true);
        this.applyThemeDefaults();

        this.selectionManager.registerOnSelectCallback(ids => {
            if (this.getInteractionMode() === "highlight") {
                this.syncSelectionState(ids.filter(isVisualSelectionId));
            }
        });

        this.svg.on("click", (event: MouseEvent) => this.handleBackgroundClick(event));
        this.svg.on("contextmenu", (event: MouseEvent) => this.handleContextMenu(event));
        this.svg.on("keydown", (event: KeyboardEvent) => this.handleRootKeydown(event));
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);
        try {
            this.renderUpdate(options);
        } catch {
            try {
                this.renderFailure("The visual could not be rendered.");
            } catch {
                this.announce("The visual could not be rendered.");
            }
            this.eventService.renderingFailed(options, "Unable to render the visual.");
            return;
        }
        this.eventService.renderingFinished(options);
    }

    private renderUpdate(options: VisualUpdateOptions): void {
        this.resetCanvas(options.viewport.width, options.viewport.height);
        this.dataView = options.dataViews?.[0];

        if (!this.dataView) {
            this.renderLandingPage();
            return;
        }

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            this.dataView
        );
        this.applyThemeDefaults(this.dataView);
        this.restoreFilterState(options.jsonFilters);

        this.parsedData = parseDataView(this.dataView, this.host.locale);
        if (!this.parsedData || this.parsedData.dataPoints.length === 0) {
            this.renderLandingPage();
            return;
        }
        if (!this.parsedData.hasActual) {
            this.renderNoData("Add at least one finite Actual value.");
            return;
        }

        this.createSelectionIds();
        const chartType = this.getChartType();
        let comparisonType = this.getComparisonType();

        if (!this.hasComparisonData(this.parsedData, comparisonType)) {
            const available = getAvailableComparisonType(this.parsedData, comparisonType);
            if (available) {
                comparisonType = available;
            } else if (["variance", "waterfall", "lollipop", "dot"].includes(chartType)) {
                this.renderNoData("Add Plan, Previous Year, or Forecast for variance analysis.");
                return;
            }
        }

        const topN = this.formattingSettings.topNCard;
        this.parsedData = applyTopN(this.parsedData, {
            enable: topN.enable.value,
            count: finiteSetting(topN.count.value, 10, 0, 1000),
            sortBy: enumSetting(topN.sortBy.value.value, ["value", "name", "variance"], "value"),
            sortDirection: enumSetting(topN.sortDirection.value.value, ["asc", "desc"], "desc"),
            showOthers: topN.showOthers.value,
            othersLabel: topN.othersLabel.value || "Others",
            comparisonType
        });
        if (this.parsedData.dataPoints.length === 0) {
            this.renderNoData("Top N settings exclude all categories.");
            return;
        }

        const viewportWidth = finiteDimension(options.viewport.width);
        const viewportHeight = finiteDimension(options.viewport.height);
        const content = this.getContentDimensions(viewportWidth, viewportHeight);
        this.svg.attr("width", content.width).attr("height", content.height);

        const settings = this.buildChartSettings(comparisonType);
        const renderedDomain = getChartValueDomain(
            chartType,
            this.parsedData,
            comparisonType,
            settings.invertVariance
        );
        settings.displayUnitReference = Math.max(Math.abs(renderedDomain[0]), Math.abs(renderedDomain[1]));
        const breakpoint = this.getResponsiveBreakpoint(viewportWidth, viewportHeight);
        this.applyResponsiveSettings(settings, breakpoint);

        if (this.parsedData.hasGroups && this.parsedData.groups.length > 1) {
            const layoutConfig = this.createLayoutConfig(chartType, settings, breakpoint);
            this.renderSmallMultiples(chartType, settings, layoutConfig, content.width, content.height);
        } else {
            const dimensions = this.calculateLayout(content.width, content.height, chartType, settings, breakpoint);
            createChart(chartType, this.chartContainer, this.parsedData, settings, dimensions).render();
        }
        if (this.allowInteractions() && this.formattingSettings.interactionCard.enableDrilldown.value) {
            this.renderDrillUpButton();
        }

        this.decorateRenderedContent();
        this.addInteractivity(comparisonType);
        if (this.getInteractionMode() === "highlight") {
            this.syncSelectionState(this.selectionManager.getSelectionIds().filter(isVisualSelectionId));
        } else {
            this.syncFilterState();
        }
    }

    private resetCanvas(width: number, height: number): void {
        const safeWidth = finiteDimension(width);
        const safeHeight = finiteDimension(height);
        this.chartContainer.selectAll("*").remove();
        this.svg.selectAll(".clear-selection-btn").remove();
        this.chartContainer.attr("transform", null);
        this.svg
            .classed("landing", false)
            .attr("width", safeWidth)
            .attr("height", safeHeight)
            .attr("viewBox", null)
            .attr("tabindex", 0)
            .attr("aria-label", "Atlyn Variance Chart");
        this.selectionIds = [];
        this.parsedData = null;
        this.statusRegion.textContent = "";
        this.target.scrollLeft = 0;
        this.target.scrollTop = 0;
    }

    private getContentDimensions(width: number, height: number): { width: number; height: number } {
        if (!this.parsedData) return { width, height };
        const minChartWidth = finiteSetting(
            this.formattingSettings.responsiveCard.minChartWidth.value,
            150,
            40,
            10_000
        );
        const denseWidth = this.parsedData.dataPoints.length * 36 + 100;
        const contentWidth = Math.max(width, denseWidth > width ? denseWidth : width);

        if (!this.parsedData.hasGroups || this.parsedData.groups.length < 2) {
            return { width: contentWidth, height };
        }

        const requestedColumns = Math.floor(this.formattingSettings.smallMultiplesCard.columns.value);
        const columns = requestedColumns > 0
            ? Math.min(requestedColumns, this.parsedData.groups.length)
            : Math.max(1, Math.floor(Math.max(width, minChartWidth) / minChartWidth));
        const rows = Math.ceil(this.parsedData.groups.length / columns);
        return {
            width: Math.max(width, columns * minChartWidth),
            height: Math.max(height, rows * 170)
        };
    }

    private applyThemeDefaults(dataView?: DataView): void {
        const palette = this.host.colorPalette;
        const color = (key: string, fallback: string): string =>
            typeof palette.getColor === "function" ? palette.getColor(key).value : fallback;
        const hasValue = (objectName: string, propertyName: string): boolean =>
            dataView?.metadata?.objects?.[objectName]?.[propertyName] !== undefined;

        this.foreground = palette.foreground?.value ?? "#333333";
        this.background = palette.background?.value ?? "#ffffff";
        this.selectionColor = palette.selection?.value ?? palette.foregroundSelected?.value ?? this.foreground;

        const setColor = (
            objectName: string,
            propertyName: string,
            slice: { value: { value: string } },
            fallback: string
        ): void => {
            if (!hasValue(objectName, propertyName)) slice.value.value = fallback;
        };

        setColor("title", "fontColor", this.formattingSettings.titleCard.fontColor, this.foreground);
        setColor("categories", "fontColor", this.formattingSettings.categoriesCard.fontColor, this.foreground);
        setColor("commentBox", "fontColor", this.formattingSettings.commentBoxCard.fontColor, this.foreground);
        setColor("commentBox", "markerColor", this.formattingSettings.commentBoxCard.markerColor, this.selectionColor);
        setColor("design", "actualColor", this.formattingSettings.designCard.actualColor, color("Actual", "#404040"));
        setColor("design", "budgetColor", this.formattingSettings.designCard.budgetColor, color("Plan", "#808080"));
        setColor("design", "previousYearColor", this.formattingSettings.designCard.previousYearColor, color("Previous Year", "#9e9e9e"));
        setColor("design", "forecastColor", this.formattingSettings.designCard.forecastColor, color("Forecast", "#606060"));
        setColor("design", "positiveVarianceColor", this.formattingSettings.designCard.positiveVarianceColor, palette.positive?.value ?? color("Positive variance", "#4caf50"));
        setColor("design", "negativeVarianceColor", this.formattingSettings.designCard.negativeVarianceColor, palette.negative?.value ?? color("Negative variance", "#f44336"));

        this.target.style.setProperty("--atlyn-foreground", this.foreground);
        this.target.style.setProperty("--atlyn-background", this.background);
        this.target.style.setProperty("--atlyn-selection", this.selectionColor);
    }

    private getChartType(): ChartType {
        return enumSetting(
            this.formattingSettings.chartSettingsCard.chartType.value.value,
            CHART_TYPES,
            "variance"
        );
    }

    private getComparisonType(): ComparisonType {
        return enumSetting(
            this.formattingSettings.chartSettingsCard.comparisonType.value.value,
            ["budget", "previousYear", "forecast"],
            "budget"
        );
    }

    private getInteractionMode(): "highlight" | "filter" {
        return String(this.formattingSettings.interactionCard.crossFilterMode.value.value) === "filter"
            ? "filter"
            : "highlight";
    }

    private allowInteractions(): boolean {
        return this.host.hostCapabilities?.allowInteractions !== false;
    }

    private getResponsiveBreakpoint(width: number, height: number): string {
        if (!this.formattingSettings.responsiveCard.enable.value) return "large";
        const minimum = finiteSetting(
            this.formattingSettings.responsiveCard.minChartWidth.value,
            150,
            1,
            10_000
        );
        if (width < minimum || height < minimum) return "small";
        if (width < minimum * 2.5 || height < minimum * 2) return "medium";
        return "large";
    }

    private buildChartSettings(comparisonType: ComparisonType): ChartSettings {
        const labels = this.formattingSettings.dataLabelsCard;
        const categories = this.formattingSettings.categoriesCard;
        const legendPosition = enumSetting(
            this.formattingSettings.legendCard.position.value.value,
            ["top", "bottom", "left", "right"],
            "right"
        ) as LegendPosition;
        const displayUnits = enumSetting<NumberScale>(
            labels.displayUnits.value.value,
            ["auto", "none", "thousands", "millions", "billions"],
            "auto"
        );

        return {
            invertVariance: this.formattingSettings.chartSettingsCard.invertVariance.value,
            comparisonType,
            colors: this.getColors(),
            foreground: this.foreground,
            background: this.background,
            highContrast: this.host.colorPalette.isHighContrast === true,
            locale: this.host.locale,
            title: {
                show: this.formattingSettings.titleCard.show.value,
                text: this.formattingSettings.titleCard.titleText.value || "",
                fontSize: finiteSetting(this.formattingSettings.titleCard.fontSize.value, 14, 0, 200),
                fontColor: this.host.colorPalette.isHighContrast
                    ? this.foreground
                    : this.formattingSettings.titleCard.fontColor.value.value,
                alignment: enumSetting(
                    this.formattingSettings.titleCard.alignment.value.value,
                    ["left", "center", "right"],
                    "left"
                )
            },
            dataLabels: {
                show: labels.show.value,
                showValues: labels.showValues.value,
                showVariance: labels.showVariance.value,
                showPercentage: labels.showPercentage.value,
                fontSize: finiteSetting(labels.fontSize.value, 10, 0, 200),
                decimalPlaces: Math.floor(finiteSetting(labels.decimalPlaces.value, 1, 0, 20)),
                displayUnits,
                negativeFormat: enumSetting<"minus" | "parentheses">(
                    labels.negativeFormat.value.value,
                    ["minus", "parentheses"],
                    "minus"
                ),
                labelDensity: enumSetting(
                    labels.labelDensity.value.value,
                    ["all", "auto", "firstLast", "minMax", "none"],
                    "all"
                )
            },
            categories: {
                show: categories.show.value,
                fontSize: finiteSetting(categories.fontSize.value, 10, 0, 200),
                fontColor: this.host.colorPalette.isHighContrast
                    ? this.foreground
                    : categories.fontColor.value.value,
                rotation: finiteSetting(
                    Number.parseInt(String(categories.rotation.value.value), 10),
                    0,
                    -90,
                    90
                ),
                maxWidth: finiteSetting(categories.maxWidth.value, 100, 0, 1000)
            },
            legend: {
                show: this.formattingSettings.legendCard.show.value,
                position: legendPosition,
                fontSize: finiteSetting(this.formattingSettings.legendCard.fontSize.value, 10, 0, 200)
            },
            commentBox: {
                show: this.formattingSettings.commentBoxCard.show.value,
                showVariance: enumSetting(
                    this.formattingSettings.commentBoxCard.showVariance.value.value,
                    ["none", "absolute", "relative", "both"],
                    "relative"
                ),
                varianceIcon: enumSetting(
                    this.formattingSettings.commentBoxCard.varianceIcon.value.value,
                    ["none", "triangle", "circle", "arrow"],
                    "triangle"
                ),
                padding: finiteSetting(this.formattingSettings.commentBoxCard.padding.value, 6, 0, 500),
                gap: finiteSetting(this.formattingSettings.commentBoxCard.gap.value, 8, 0, 500),
                fontSize: finiteSetting(this.formattingSettings.commentBoxCard.fontSize.value, 10, 0, 200),
                fontColor: this.host.colorPalette.isHighContrast
                    ? this.foreground
                    : this.formattingSettings.commentBoxCard.fontColor.value.value,
                markerSize: finiteSetting(this.formattingSettings.commentBoxCard.markerSize.value, 18, 0, 500),
                markerColor: this.host.colorPalette.isHighContrast
                    ? this.foreground
                    : this.formattingSettings.commentBoxCard.markerColor.value.value
            },
            highlighting: {
                show: this.formattingSettings.differenceHighlightingCard.show.value,
                threshold: finiteSetting(
                    this.formattingSettings.differenceHighlightingCard.threshold.value,
                    10,
                    0,
                    Number.MAX_VALUE
                ),
                highlightPositive: this.formattingSettings.differenceHighlightingCard.highlightPositive.value,
                highlightNegative: this.formattingSettings.differenceHighlightingCard.highlightNegative.value
            },
            axisBreak: {
                show: this.formattingSettings.axisBreakCard.show.value,
                breakValue: finiteSetting(
                    this.formattingSettings.axisBreakCard.breakValue.value,
                    0,
                    -Number.MAX_VALUE,
                    Number.MAX_VALUE
                )
            },
            showVarianceLabels: labels.showVariance.value,
            showPercentage: labels.showPercentage.value,
            fontSize: finiteSetting(labels.fontSize.value, 10, 0, 200),
            fontColor: this.foreground
        };
    }

    private applyResponsiveSettings(settings: ChartSettings, breakpoint: string): void {
        if (breakpoint === "small") {
            settings.title.show = false;
            settings.legend.show = false;
            settings.dataLabels.show = false;
            settings.commentBox.show = false;
            settings.categories.fontSize = Math.min(settings.categories.fontSize, 8);
            settings.categories.rotation = -90;
            settings.axisBreak.show = false;
        } else if (breakpoint === "medium") {
            settings.legend.show = false;
            settings.commentBox.show = false;
            settings.dataLabels.fontSize = Math.min(settings.dataLabels.fontSize, 9);
            settings.categories.fontSize = Math.min(settings.categories.fontSize, 9);
            settings.title.fontSize = Math.min(settings.title.fontSize, 12);
        }
    }

    private createLayoutConfig(
        chartType: ChartType,
        settings: ChartSettings,
        breakpoint: string
    ): LayoutConfig {
        return {
            title: { show: settings.title.show },
            legend: { show: settings.legend.show, position: settings.legend.position },
            commentBox: { show: settings.commentBox.show },
            categories: settings.categories,
            hasComments: this.parsedData?.hasComments ?? false,
            chartType,
            breakpoint
        };
    }

    private calculateLayout(
        width: number,
        height: number,
        chartType: ChartType,
        settings: ChartSettings,
        breakpoint: string
    ): ChartDimensions {
        return calculateLayoutEngine(
            width,
            height,
            this.createLayoutConfig(chartType, settings, breakpoint)
        );
    }

    private renderSmallMultiples(
        chartType: ChartType,
        settings: ChartSettings,
        layoutConfig: LayoutConfig,
        totalWidth: number,
        totalHeight: number
    ): void {
        if (!this.parsedData) return;
        const groupKeys = getGroupKeys(this.parsedData);
        const multipleSettings = this.formattingSettings.smallMultiplesCard;
        const layout = calculateLayoutEngine(totalWidth, totalHeight, layoutConfig).layout;
        const viewport = layout?.chartArea
            ?? getSmallMultiplesViewport(totalWidth, totalHeight, layoutConfig);
        const config: SmallMultiplesConfig = {
            columns: Math.floor(finiteSetting(
                multipleSettings.columns.value,
                0,
                0,
                Math.max(1, groupKeys.length)
            )),
            spacing: finiteSetting(multipleSettings.spacing.value, 10, 0, 500),
            showHeaders: multipleSettings.showHeaders.value,
            categoryRotation: settings.categories.rotation,
            categoryMaxWidth: settings.categories.maxWidth,
            categoryFontSize: settings.categories.fontSize
        };
        const grid = calculateSmallMultiplesGrid(
            Math.max(0, viewport.width),
            Math.max(0, viewport.height),
            groupKeys.length,
            config
        );

        const scaleMode = enumSetting(
            multipleSettings.scaleMode.value.value,
            ["shared", "independent"] as const,
            "shared"
        );
        const sharedDomain = scaleMode === "shared"
            ? getChartValueDomain(chartType, this.parsedData, settings.comparisonType, settings.invertVariance)
            : undefined;

        groupKeys.forEach((groupKey, index) => {
            if (!this.parsedData) return;
            const cell = calculateCellLayout(grid, index, config);
            const groupPoints = this.parsedData.dataPoints.filter(
                point => getDataPointGroupKey(point) === groupKey
            );
            const groupLabel = groupPoints[0]?.group ?? "";
            const groupData = subsetParsedData(
                this.parsedData,
                groupPoints
            );
            const cellSvg = this.chartContainer.append("svg")
                .attr("x", viewport.x + cell.x)
                .attr("y", viewport.y + cell.y)
                .attr("width", Math.max(0, grid.cellWidth))
                .attr("height", Math.max(0, grid.cellHeight))
                .attr("overflow", "hidden");

            if (config.showHeaders) {
                cellSvg.append("text")
                    .attr("class", "small-multiple-header")
                    .attr("x", Math.max(0, grid.cellWidth) / 2)
                    .attr("y", 14)
                    .attr("text-anchor", "middle")
                    .attr("font-size", "11px")
                    .attr("font-weight", "bold")
                    .attr("fill", this.foreground)
                    .text(groupLabel);
            }

            const chartViewport = cellSvg.append("g")
                .attr("transform", `translate(0, ${Math.max(0, cell.headerHeight)})`);
            const chartGroup = chartViewport.append("g");
            const dimensions: ChartDimensions = {
                width: Math.max(0, grid.cellWidth),
                height: Math.max(0, grid.cellHeight - cell.headerHeight),
                margin: {
                    top: Math.max(0, cell.margin.top),
                    right: Math.max(0, cell.margin.right),
                    bottom: Math.max(0, cell.margin.bottom),
                    left: Math.max(0, cell.margin.left)
                }
            };
            const cellSettings: ChartSettings = {
                ...settings,
                legend: { ...settings.legend, show: false },
                commentBox: { ...settings.commentBox, show: false },
                title: { ...settings.title, show: false },
                axisBreak: { ...settings.axisBreak, show: false },
                sharedValueDomain: sharedDomain
            };
            createChart(chartType, chartGroup, groupData, cellSettings, dimensions).render();
        });

        this.renderSmallMultiplesTitle(settings, totalWidth);
        this.renderSmallMultiplesLegend(chartType, settings, layout?.legendArea);
        this.renderSmallMultiplesComments(settings, layout?.commentBoxArea);
    }

    private renderSmallMultiplesTitle(settings: ChartSettings, totalWidth: number): void {
        if (!settings.title.show || !settings.title.text) return;
        const x = settings.title.alignment === "center"
            ? totalWidth / 2
            : settings.title.alignment === "right" ? totalWidth - 10 : 10;
        this.chartContainer.append("text")
            .attr("class", "chart-title")
            .attr("x", x)
            .attr("y", 20)
            .attr("text-anchor", settings.title.alignment === "center" ? "middle" : settings.title.alignment === "right" ? "end" : "start")
            .attr("font-size", `${settings.title.fontSize}px`)
            .attr("font-weight", "bold")
            .attr("fill", settings.title.fontColor)
            .text(settings.title.text);
    }

    private renderSmallMultiplesLegend(
        chartType: ChartType,
        settings: ChartSettings,
        area?: LayoutRect
    ): void {
        if (!settings.legend.show || !area) return;
        const items = this.buildLegendItems(chartType, settings);
        const legend = this.chartContainer.append("g").attr("class", "legend");
        const horizontal = settings.legend.position === "top" || settings.legend.position === "bottom";
        const x = horizontal
            ? area.x + Math.max(0, (area.width - items.length * 70) / 2)
            : area.x + 5;
        const y = area.y + 10;
        legend.attr("transform", `translate(${x}, ${y})`);
        items.forEach((item, index) => {
            const itemX = horizontal ? index * 70 : 0;
            const itemY = horizontal ? 0 : index * 20;
            legend.append("rect")
                .attr("x", itemX)
                .attr("y", itemY)
                .attr("width", 12)
                .attr("height", 12)
                .attr("fill", item.outlined ? "none" : item.color)
                .attr("stroke", item.color)
                .attr("stroke-width", item.outlined ? 2 : 1)
                .attr("stroke-dasharray", item.outlined ? "3,1" : null);
            legend.append("text")
                .attr("x", itemX + 18)
                .attr("y", itemY + 10)
                .attr("font-size", `${settings.legend.fontSize}px`)
                .attr("fill", this.foreground)
                .text(item.label);
        });
    }

    private renderSmallMultiplesComments(
        settings: ChartSettings,
        area?: LayoutRect
    ): void {
        if (!this.parsedData || !settings.commentBox.show || !this.parsedData.hasComments || !area) return;
        const comments = this.parsedData.dataPoints.filter(point => point.comment.trim() !== "");
        if (comments.length === 0) return;
        const x = area.x + 10;
        const y = area.y;
        const width = Math.max(0, area.width - 20);
        const height = Math.max(0, area.height);
        if (width === 0 || height === 0) return;
        const box = this.chartContainer.append("foreignObject")
            .attr("class", "comment-box")
            .attr("x", x)
            .attr("y", y)
            .attr("width", width)
            .attr("height", height);
        const scroll = box.append("xhtml:div")
            .attr("role", "region")
            .attr("aria-label", "Chart comments")
            .attr("tabindex", 0)
            .style("width", `${width}px`)
            .style("height", `${height}px`)
            .style("overflow-y", "auto")
            .style("color", this.foreground)
            .style("background", this.background)
            .style("box-sizing", "border-box");

        comments.forEach((point, index) => {
            const variance = getVariance(point, settings.comparisonType);
            const percentage = getVariancePct(point, settings.comparisonType);
            const displayedVariance = variance === null ? null : settings.invertVariance ? -variance : variance;
            const displayedPercentage = percentage === null ? null : settings.invertVariance ? -percentage : percentage;
            const card = scroll.append("xhtml:div")
                .style("display", "flex")
                .style("gap", `${settings.commentBox.padding}px`)
                .style("margin-bottom", `${settings.commentBox.gap}px`)
                .style("padding", `${settings.commentBox.padding}px 0`);
            card.append("xhtml:div")
                .attr("class", "comment-card-marker")
                .attr("data-comment-source", point.sourceIndices.join(","))
                .style("min-width", `${settings.commentBox.markerSize}px`)
                .style("height", `${settings.commentBox.markerSize}px`)
                .style("border", `2px solid ${settings.commentBox.markerColor}`)
                .style("border-radius", "50%")
                .style("text-align", "center")
                .style("color", settings.commentBox.markerColor)
                .text(String(index + 1));
            const content = card.append("xhtml:div");
            content.append("xhtml:div")
                .style("font-weight", "bold")
                .style("color", settings.commentBox.fontColor)
                .text(point.group ? `${point.group}, ${point.category}` : point.category);
            const value = this.formatMeasure(point.actual, "actual");
            let varianceText = "";
            if (
                displayedVariance !== null
                && (settings.commentBox.showVariance === "absolute" || settings.commentBox.showVariance === "both")
            ) {
                varianceText += ` ${this.formatMeasure(displayedVariance, "actual")}`;
            }
            if (
                displayedPercentage !== null
                && (settings.commentBox.showVariance === "relative" || settings.commentBox.showVariance === "both")
            ) {
                varianceText += ` ${formatPercent(displayedPercentage, 1, true, this.host.locale)}`;
            }
            const valueLine = content.append("xhtml:div")
                .style("color", this.foreground)
                .text(`${value}${varianceText}`);
            if (
                settings.commentBox.varianceIcon !== "none"
                && settings.commentBox.showVariance !== "none"
                && displayedVariance !== null
                && displayedVariance !== 0
            ) {
                const positive = displayedVariance > 0;
                const icon = settings.commentBox.varianceIcon === "triangle"
                    ? positive ? " ▲" : " ▼"
                    : settings.commentBox.varianceIcon === "arrow"
                        ? positive ? " ↑" : " ↓"
                        : " ●";
                valueLine.append("xhtml:span")
                    .style("color", positive ? settings.colors.positiveVariance : settings.colors.negativeVariance)
                    .text(icon);
            }
            content.append("xhtml:div").style("color", this.foreground).text(point.comment.trim());
        });
    }

    private buildLegendItems(
        chartType: ChartType,
        settings: ChartSettings
    ): Array<{ label: string; color: string; outlined?: boolean }> {
        const comparisonAvailable = this.parsedData !== null
            && this.hasComparisonData(this.parsedData, settings.comparisonType);
        const comparison = comparisonAvailable ? {
            label: this.getComparisonLabel(settings.comparisonType),
            color: settings.colors[settings.comparisonType],
            outlined: true
        } : null;
        const actual = { label: "Actual", color: settings.colors.actual };
        const variance = [
            { label: "+Variance", color: settings.colors.positiveVariance },
            { label: "−Variance", color: settings.colors.negativeVariance }
        ];

        if (chartType === "line" || chartType === "area" || chartType === "combo") {
            const comparisons: Array<{ label: string; color: string }> = [];
            if (this.parsedData?.hasBudget) {
                comparisons.push({ label: "Plan", color: settings.colors.budget });
            }
            if (this.parsedData?.hasPreviousYear) {
                comparisons.push({ label: "Previous Year", color: settings.colors.previousYear });
            }
            if (this.parsedData?.hasForecast) {
                comparisons.push({ label: "Forecast", color: settings.colors.forecast });
            }
            return [actual, ...comparisons];
        }
        if (chartType === "lollipop") {
            return comparison ? variance : [];
        }
        if (chartType === "dot") {
            return comparison ? [comparison, actual, ...variance] : [actual];
        }
        if (chartType === "variance" || chartType === "waterfall") {
            return comparison ? [comparison, actual, ...variance] : [actual];
        }
        return comparison ? [actual, comparison] : [actual];
    }

    private createSelectionIds(): void {
        this.selectionIds = [];
        const category = this.getCategoryColumn();
        if (!category) return;
        const group = this.getGroupColumn();
        for (let index = 0; index < category.values.length; index++) {
            let builder = this.host.createSelectionIdBuilder().withCategory(category, index);
            if (group && index < group.values.length) builder = builder.withCategory(group, index);
            this.selectionIds.push(builder.createSelectionId());
        }
    }

    private getCategoryColumn(): DataViewCategoryColumn | undefined {
        const categories = this.dataView?.categorical?.categories;
        if (!categories) return undefined;
        return categories.find(column => column.source.roles?.["category"]) ?? categories[0];
    }

    private getGroupColumn(): DataViewCategoryColumn | undefined {
        return this.dataView?.categorical?.categories?.find(column => column.source.roles?.["group"]);
    }

    private addInteractivity(comparisonType: ComparisonType): void {
        if (!this.parsedData) return;
        const points = this.chartContainer.selectAll<SVGElement, unknown>("[data-source-indices]");
        const primaryByKey = new Map<string, SVGElement>();
        const enableSelection = this.allowInteractions()
            && this.formattingSettings.interactionCard.enableSelection.value;
        const enableDrilldown = this.allowInteractions()
            && this.formattingSettings.interactionCard.enableDrilldown.value;

        points.each((_, elementIndex, nodes) => {
            const element = nodes[elementIndex];
            const sourceIndices = this.getSourceIndices(element);
            const key = sourceIndices.join(",");
            const point = this.getDataPoint(sourceIndices);
            if (!point || sourceIndices.length === 0) {
                element.removeAttribute("data-source-indices");
                element.setAttribute("aria-hidden", "true");
                return;
            }

            element.classList.add("data-point-mark");
            element.style.cursor = enableSelection || enableDrilldown ? "pointer" : "default";
            if (!primaryByKey.has(key)) {
                primaryByKey.set(key, element);
                element.classList.add("logical-data-point");
                element.setAttribute("role", enableSelection || enableDrilldown ? "button" : "img");
                element.setAttribute("aria-label", this.getAccessibleName(point, comparisonType));
                element.setAttribute("tabindex", this.focusSourceKey === key || (!this.focusSourceKey && primaryByKey.size === 1) ? "0" : "-1");
                if (enableDrilldown && sourceIndices.length === 1) {
                    element.setAttribute("aria-keyshortcuts", "Alt+ArrowDown");
                }
            } else {
                element.setAttribute("tabindex", "-1");
                element.setAttribute("aria-hidden", "true");
            }

            if (enableSelection) {
                d3.select(element).on("click", (event: MouseEvent) => {
                    event.stopPropagation();
                    this.activatePoint(sourceIndices, event.ctrlKey || event.metaKey);
                });
            }
            if (enableDrilldown && sourceIndices.length === 1) {
                d3.select(element).on("dblclick", (event: MouseEvent) => {
                    event.stopPropagation();
                    this.activateDrillPoint(sourceIndices);
                });
            }

            if (
                this.formattingSettings.interactionCard.enableTooltips.value
                && this.host.tooltipService.enabled()
            ) {
                d3.select(element)
                    .on("mouseover", (event: MouseEvent) => this.showTooltip(event, point, sourceIndices, comparisonType))
                    .on("mousemove", (event: MouseEvent) => this.moveTooltip(event, point, sourceIndices, comparisonType))
                    .on("mouseout", () => this.host.tooltipService.hide({ immediately: true, isTouchEvent: false }));
            }
        });

        if (![...primaryByKey.values()].some(element => element.getAttribute("tabindex") === "0")) {
            const first = primaryByKey.entries().next().value;
            if (first) {
                this.focusSourceKey = first[0];
                first[1].setAttribute("tabindex", "0");
            }
        }

        for (const [key, element] of primaryByKey) {
            d3.select(element)
                .on("focus", () => {
                    this.focusSourceKey = key;
                    this.updateRovingTabindex(key);
                })
                .on("keydown", (event: KeyboardEvent) => this.handlePointKeydown(event, element));
        }

        this.svg.attr("tabindex", 0);
        this.decorateCommentRegions();
    }

    private getSourceIndices(element: Element): number[] {
        const source = element.getAttribute("data-source-indices");
        if (!source) return [];
        const indices: number[] = [];
        for (const part of source.split(",")) {
            const index = Number(part);
            if (Number.isInteger(index) && index >= 0 && !indices.includes(index)) indices.push(index);
        }
        return indices;
    }

    private getDataPoint(sourceIndices: number[]): DataPoint | undefined {
        if (!this.parsedData) return undefined;
        const key = sourceIndices.join(",");
        return this.parsedData.dataPoints.find(point => point.sourceIndices.join(",") === key);
    }

    private getSelectionIds(sourceIndices: number[]): ISelectionId[] {
        return sourceIndices
            .map(index => this.selectionIds[index])
            .filter((selectionId): selectionId is ISelectionId => selectionId !== undefined);
    }

    private activatePoint(sourceIndices: number[], multiSelect: boolean): void {
        const point = this.getDataPoint(sourceIndices);
        if (!point) return;
        if (this.getInteractionMode() === "filter") {
            if (this.applyCrossFilter(sourceIndices, multiSelect)) {
                this.announce(`${point.category} filter updated.`);
            }
            return;
        }

        const ids = this.getSelectionIds(sourceIndices);
        if (ids.length === 0) return;
        this.selectionManager.select(ids.length === 1 ? ids[0] : ids, multiSelect).then(
            selected => {
                this.syncSelectionState(selected.filter(isVisualSelectionId));
                this.announce(`${point.category} selected.`);
            },
            () => this.announceInteractionError()
        );
    }

    private handleBackgroundClick(event: MouseEvent): void {
        if (!this.allowInteractions() || !this.formattingSettings.interactionCard.enableSelection.value) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest("[data-source-indices], .visual-control")) return;
        this.clearInteraction();
    }

    private clearInteraction(): void {
        if (!this.allowInteractions() || !this.formattingSettings.interactionCard.enableSelection.value) return;
        if (this.getInteractionMode() === "filter") {
            this.clearCrossFilter();
            return;
        }
        this.selectionManager.clear().then(
            () => {
                this.syncSelectionState([]);
                this.announce("Selection cleared.");
            },
            () => this.announceInteractionError()
        );
    }

    private applyCrossFilter(sourceIndices: number[], multiSelect: boolean): boolean {
        const tuples = sourceIndices
            .map(index => this.getFilterTuple(index))
            .filter((tuple): tuple is FilterTuple => tuple !== null);
        if (tuples.length === 0) {
            this.announceInteractionError();
            return false;
        }

        const next = multiSelect
            ? new Map(this.filterTuples)
            : new Map<string, FilterTuple>();
        const allSelected = tuples.every(tuple => next.has(this.filterKey(tuple)));
        for (const tuple of tuples) {
            const key = this.filterKey(tuple);
            if (multiSelect && allSelected) next.delete(key);
            else next.set(key, tuple);
        }

        if (!this.applyFilterState(next)) return false;
        this.filterTuples = next;
        this.syncFilterState();
        return true;
    }

    private clearCrossFilter(): void {
        if (!this.applyFilterState(new Map())) return;
        this.filterTuples.clear();
        this.syncFilterState();
        this.announce("Filter cleared.");
    }

    private applyFilterState(state: Map<string, FilterTuple>): boolean {
        try {
            if (state.size === 0) {
                this.host.applyJsonFilter(
                    // The 5.11 runtime/docs require null to clear; its declaration omits null.
                    null as never,
                    "general",
                    "filter",
                    FILTER_REMOVE
                );
                return true;
            }
            const categoryTarget = this.getFilterTarget(this.getCategoryColumn());
            if (!categoryTarget) throw new Error("Category target unavailable");
            const group = this.getGroupColumn();
            if (group) {
                const groupTarget = this.getFilterTarget(group);
                if (!groupTarget) throw new Error("Group target unavailable");
                const values: TupleValueType[] = Array.from(state.values()).flatMap(tuple =>
                    tuple.group === undefined
                        ? []
                        : [[{ value: tuple.category }, { value: tuple.group }]]
                );
                if (values.length !== state.size) throw new Error("Incomplete filter tuple");
                this.host.applyJsonFilter(
                    new TupleFilter([categoryTarget, groupTarget], "In", values),
                    "general",
                    "filter",
                    FILTER_MERGE
                );
            } else {
                this.host.applyJsonFilter(
                    new BasicFilter(
                        categoryTarget,
                        "In",
                        Array.from(state.values()).map(tuple => tuple.category)
                    ),
                    "general",
                    "filter",
                    FILTER_MERGE
                );
            }
            return true;
        } catch {
            this.announceInteractionError();
            return false;
        }
    }

    private getFilterValue(column: DataViewCategoryColumn | undefined, index: number): FilterValue | null {
        const value = column?.values[index];
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
        if (typeof value === "number") return Number.isFinite(value) ? value : null;
        if (typeof value === "string" || typeof value === "boolean") return value;
        return null;
    }

    private getFilterTuple(index: number): FilterTuple | null {
        const category = this.getFilterValue(this.getCategoryColumn(), index);
        if (category === null) return null;
        const groupColumn = this.getGroupColumn();
        if (!groupColumn) return { category };
        const group = this.getFilterValue(groupColumn, index);
        return group === null ? null : { category, group };
    }

    private valueKey(value: FilterValue): string {
        return `${typeof value}:${String(value)}`;
    }

    private filterKey(tuple: FilterTuple): string {
        return tuple.group === undefined
            ? this.valueKey(tuple.category)
            : `${this.valueKey(tuple.category)}|${this.valueKey(tuple.group)}`;
    }

    private getFilterTarget(category?: DataViewCategoryColumn): IFilterColumnTarget | null {
        if (!category) return null;
        const queryName = category.source.queryName ?? "";
        const separator = queryName.lastIndexOf(".");
        if (separator <= 0 || separator === queryName.length - 1) return null;
        return {
            table: queryName.slice(0, separator),
            column: queryName.slice(separator + 1)
        };
    }

    private restoreFilterState(filters?: powerbi.IFilter[]): void {
        if (filters === undefined) return;
        if (filters.length === 0) {
            this.filterTuples.clear();
            return;
        }
        const categoryTarget = this.getFilterTarget(this.getCategoryColumn());
        const groupTarget = this.getFilterTarget(this.getGroupColumn());
        if (!categoryTarget) return;
        const restored = new Map<string, FilterTuple>();
        let matched = false;
        for (const filter of filters) {
            if (
                groupTarget === null
                && isBasicFilter(filter)
                && isColumnTarget(filter.target)
                && this.targetsEqual(filter.target, categoryTarget)
            ) {
                matched = true;
                for (const category of filter.values) {
                    const tuple = { category };
                    restored.set(this.filterKey(tuple), tuple);
                }
            } else if (
                groupTarget !== null
                && isTupleFilter(filter)
                && filter.target.length === 2
                && isColumnTarget(filter.target[0])
                && isColumnTarget(filter.target[1])
                && this.targetsEqual(filter.target[0], categoryTarget)
                && this.targetsEqual(filter.target[1], groupTarget)
            ) {
                matched = true;
                for (const tupleValue of filter.values) {
                    if (tupleValue.length !== 2) continue;
                    const tuple = {
                        category: tupleValue[0].value,
                        group: tupleValue[1].value
                    };
                    restored.set(this.filterKey(tuple), tuple);
                }
            }
        }
        this.filterTuples = matched ? restored : new Map();
    }

    private targetsEqual(left: IFilterColumnTarget, right: IFilterColumnTarget): boolean {
        return left.table === right.table && left.column === right.column;
    }

    private syncSelectionState(selectedIds: ISelectionId[]): void {
        const selectedSources = new Set<number>();
        for (let index = 0; index < this.selectionIds.length; index++) {
            const ownId = this.selectionIds[index];
            if (selectedIds.some(selected => ownId.equals(selected) || ownId.getKey() === selected.getKey())) {
                selectedSources.add(index);
            }
        }
        this.applyInteractionState(
            selectedIds.length > 0,
            element => this.getSourceIndices(element).some(index => selectedSources.has(index))
        );
        this.highlightComment(selectedSources.size === 1 ? [selectedSources.values().next().value as number] : []);
    }

    private syncFilterState(): void {
        const selectedSources: number[] = [];
        for (let index = 0; index < this.selectionIds.length; index++) {
            const tuple = this.getFilterTuple(index);
            if (tuple !== null && this.filterTuples.has(this.filterKey(tuple))) {
                selectedSources.push(index);
            }
        }
        this.applyInteractionState(
            this.filterTuples.size > 0,
            element => this.getSourceIndices(element).some(index => selectedSources.includes(index))
        );
        this.highlightComment(selectedSources.length === 1 ? selectedSources : []);
    }

    private applyInteractionState(hasSelection: boolean, isSelected: (element: Element) => boolean): void {
        if (!this.allowInteractions() || !this.formattingSettings.interactionCard.enableSelection.value) {
            this.chartContainer.selectAll<SVGElement, unknown>("[data-source-indices]").each((_, index, nodes) => {
                const element = nodes[index];
                element.style.opacity = "1";
                element.classList.remove("host-selected");
                element.removeAttribute("aria-pressed");
            });
            this.svg.selectAll(".clear-selection-btn").remove();
            return;
        }
        this.chartContainer.selectAll<SVGElement, unknown>("[data-source-indices]").each((_, index, nodes) => {
            const element = nodes[index];
            const selected = hasSelection && isSelected(element);
            element.style.opacity = !hasSelection || selected ? "1" : "0.3";
            element.classList.toggle("host-selected", selected);
            element.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        if (hasSelection) this.renderClearSelectionButton();
        else this.svg.selectAll(".clear-selection-btn").remove();
    }

    private highlightComment(sourceIndices: number[]): void {
        const key = sourceIndices.join(",");
        this.target.querySelectorAll<Element>("[data-comment-source]").forEach(element => {
            element.classList.toggle(
                "comment-highlighted",
                key.length > 0 && element.getAttribute("data-comment-source") === key
            );
        });
    }

    private renderClearSelectionButton(): void {
        this.svg.selectAll(".clear-selection-btn").remove();
        const button = this.svg.append("g")
            .attr("class", "clear-selection-btn visual-control")
            .attr("role", "button")
            .attr("aria-label", "Clear selection")
            .attr("tabindex", 0)
            .attr("transform", "translate(8, 8)")
            .on("click", (event: MouseEvent) => {
                event.stopPropagation();
                this.clearInteraction();
            })
            .on("keydown", (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.clearInteraction();
                }
            });
        button.append("rect")
            .attr("width", 22)
            .attr("height", 22)
            .attr("rx", 3)
            .attr("fill", this.background)
            .attr("stroke", this.foreground);
        button.append("text")
            .attr("x", 11)
            .attr("y", 16)
            .attr("text-anchor", "middle")
            .attr("fill", this.foreground)
            .text("×");
    }

    private showTooltip(
        event: MouseEvent,
        point: DataPoint,
        sourceIndices: number[],
        comparisonType: ComparisonType
    ): void {
        this.host.tooltipService.show({
            dataItems: this.buildTooltipForDataPoint(point, comparisonType),
            identities: this.getSelectionIds(sourceIndices),
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false
        });
    }

    private moveTooltip(
        event: MouseEvent,
        point: DataPoint,
        sourceIndices: number[],
        comparisonType: ComparisonType
    ): void {
        this.host.tooltipService.move({
            dataItems: this.buildTooltipForDataPoint(point, comparisonType),
            identities: this.getSelectionIds(sourceIndices),
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false
        });
    }

    private buildTooltipForDataPoint(point: DataPoint, comparisonType: ComparisonType): VisualTooltipDataItem[] {
        const comparisonLabel = this.getComparisonLabel(comparisonType);
        const { variance, percentage } = this.getDisplayedVariance(point, comparisonType);
        const items: VisualTooltipDataItem[] = [{ displayName: "Category", value: point.category }];
        if (point.actual !== null) {
            items.push({
                displayName: "Actual",
                value: this.formatModelMeasure(point.actual, "actual")
            });
        }
        const comparisons: Array<{ type: ComparisonType; label: string; available: boolean }> = [
            { type: "budget", label: "Plan", available: this.parsedData?.hasBudget === true },
            { type: "previousYear", label: "Previous Year", available: this.parsedData?.hasPreviousYear === true },
            { type: "forecast", label: "Forecast", available: this.parsedData?.hasForecast === true }
        ];
        for (const comparison of comparisons) {
            const value = getComparisonValue(point, comparison.type);
            if (comparison.available && value !== null) {
                items.push({
                    displayName: comparison.label,
                    value: this.formatModelMeasure(value, comparison.type)
                });
            }
        }
        if (variance !== null) {
            items.push({
                displayName: `Variance to ${comparisonLabel}`,
                value: percentage === null
                    ? this.formatModelMeasure(variance, "actual", true)
                    : `${this.formatModelMeasure(variance, "actual", true)} (${formatPercent(percentage, 1, true, this.host.locale)})`
            });
        }
        if (point.tooltipFields) {
            items.push(...point.tooltipFields.map(field => ({ displayName: field.displayName, value: field.value })));
        }
        if (point.comment) items.push({ displayName: "Comment", value: point.comment });
        return items;
    }

    private formatMeasure(value: FiniteValue, measure: MeasureKey, showSign = false): string {
        return formatNumber(value, {
            scale: "none",
            decimals: Math.floor(finiteSetting(
                this.formattingSettings.dataLabelsCard.decimalPlaces.value,
                1,
                0,
                20
            )),
            negativeFormat: enumSetting<"minus" | "parentheses">(
                this.formattingSettings.dataLabelsCard.negativeFormat.value.value,
                ["minus", "parentheses"],
                "minus"
            ),
            showSign,
            format: this.parsedData?.formats[measure],
            locale: this.parsedData?.locale ?? this.host.locale
        });
    }

    private formatModelMeasure(value: FiniteValue, measure: MeasureKey, showSign = false): string {
        const formatted = formatModelValue(
            value,
            this.parsedData?.formats[measure],
            this.parsedData?.locale ?? this.host.locale
        );
        if (formatted === null) return "—";
        return showSign && value !== null && value > 0 ? `+${formatted}` : formatted;
    }

    private getDisplayedVariance(
        point: DataPoint,
        comparisonType: ComparisonType
    ): { variance: FiniteValue; percentage: FiniteValue } {
        const rawVariance = getVariance(point, comparisonType);
        const rawPercentage = getVariancePct(point, comparisonType);
        if (!this.formattingSettings.chartSettingsCard.invertVariance.value) {
            return { variance: rawVariance, percentage: rawPercentage };
        }
        return {
            variance: rawVariance === null ? null : -rawVariance,
            percentage: rawPercentage === null ? null : -rawPercentage
        };
    }

    private getAccessibleName(point: DataPoint, comparisonType: ComparisonType): string {
        const comparisonLabel = this.getComparisonLabel(comparisonType);
        const parts = [point.group ? `${point.group}, ${point.category}` : point.category];
        if (point.actual !== null) {
            parts.push(`Actual ${this.formatModelMeasure(point.actual, "actual")}`);
        }
        const comparisons: Array<{ type: ComparisonType; label: string; available: boolean }> = [
            { type: "budget", label: "Plan", available: this.parsedData?.hasBudget === true },
            { type: "previousYear", label: "Previous Year", available: this.parsedData?.hasPreviousYear === true },
            { type: "forecast", label: "Forecast", available: this.parsedData?.hasForecast === true }
        ];
        for (const comparison of comparisons) {
            const value = getComparisonValue(point, comparison.type);
            if (comparison.available && value !== null) {
                parts.push(`${comparison.label} ${this.formatModelMeasure(value, comparison.type)}`);
            }
        }
        const { variance, percentage } = this.getDisplayedVariance(point, comparisonType);
        if (variance !== null) parts.push(`Variance to ${comparisonLabel} ${this.formatModelMeasure(variance, "actual", true)}`);
        if (percentage !== null) parts.push(formatPercent(percentage, 1, true, this.host.locale));
        return parts.join(". ");
    }

    private handlePointKeydown(event: KeyboardEvent, element: SVGElement): void {
        const targets = Array.from(this.target.querySelectorAll<SVGElement>(".logical-data-point"));
        const current = targets.indexOf(element);
        let next = current;
        if (event.altKey && event.key === "ArrowDown") {
            if (this.allowInteractions() && this.formattingSettings.interactionCard.enableDrilldown.value) {
                event.preventDefault();
                this.activateDrillPoint(this.getSourceIndices(element));
            }
            return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(targets.length - 1, current + 1);
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, current - 1);
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = targets.length - 1;
        else if (event.key === "Enter" || event.key === " ") {
            if (this.allowInteractions() && this.formattingSettings.interactionCard.enableSelection.value) {
                event.preventDefault();
                this.activatePoint(this.getSourceIndices(element), event.ctrlKey || event.metaKey);
            } else if (this.allowInteractions() && this.formattingSettings.interactionCard.enableDrilldown.value) {
                event.preventDefault();
                this.activateDrillPoint(this.getSourceIndices(element));
            }
            return;
        } else if (event.key === "Escape") {
            event.preventDefault();
            this.clearInteraction();
            return;
        } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            this.showKeyboardContextMenu(element);
            return;
        } else {
            return;
        }
        event.preventDefault();
        targets[next]?.focus();
    }

    private updateRovingTabindex(activeKey: string): void {
        this.target.querySelectorAll<SVGElement>(".logical-data-point").forEach(element => {
            element.setAttribute("tabindex", element.getAttribute("data-source-indices") === activeKey ? "0" : "-1");
        });
    }

    private showKeyboardContextMenu(element: SVGElement): void {
        const rect = element.getBoundingClientRect();
        this.showContextMenuForElement(element, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        });
    }

    private handleContextMenu(event: MouseEvent): void {
        event.preventDefault();
        const target = event.target;
        const element = target instanceof Element ? target.closest("[data-source-indices]") : null;
        this.showContextMenuForElement(element, { x: event.clientX, y: event.clientY });
    }

    private showContextMenuForElement(element: Element | null, position: { x: number; y: number }): void {
        if (!this.allowInteractions()) return;
        const sourceIndices = element ? this.getSourceIndices(element) : [];
        const point = this.getDataPoint(sourceIndices);
        const selectionId = point !== undefined && point.index !== null && sourceIndices.length === 1
            ? this.selectionIds[sourceIndices[0]]
            : undefined;
        this.selectionManager.showContextMenu(selectionId ?? {}, position)?.then(
            () => undefined,
            () => this.announceInteractionError()
        );
    }

    private handleRootKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            this.clearInteraction();
        } else if (
            event.target === this.svg.node()
            && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
        ) {
            event.preventDefault();
            const rect = this.svg.node()?.getBoundingClientRect();
            this.showContextMenuForElement(null, {
                x: rect ? rect.left + rect.width / 2 : 0,
                y: rect ? rect.top + rect.height / 2 : 0
            });
        }
    }

    private decorateRenderedContent(): void {
        this.chartContainer
            .selectAll(".x-axis, .y-axis, .legend, .chart-title, .axis-break-indicator, .synthetic-total")
            .attr("aria-hidden", "true");
        this.chartContainer.selectAll(".legend text").attr("fill", this.foreground);
        this.chartContainer.selectAll(".comment-box").style("color", this.foreground);
        this.chartContainer.selectAll("line").attr("aria-hidden", "true");
    }

    private decorateCommentRegions(): void {
        this.target.querySelectorAll<HTMLElement>(".comment-box > div").forEach(region => {
            region.setAttribute("role", "region");
            region.setAttribute("aria-label", "Chart comments");
            region.setAttribute("tabindex", "0");
            region.style.color = this.foreground;
            region.style.backgroundColor = this.background;
        });
    }

    private renderDrillUpButton(): void {
        if (!this.allowInteractions()) return;
        const category = this.getCategoryColumn();
        const queryName = category?.source.queryName ?? "";
        if (queryName.split(".").length <= 2) return;
        const button = this.chartContainer.append("g")
            .attr("class", "drill-up-button visual-control")
            .attr("role", "button")
            .attr("aria-label", "Drill up")
            .attr("tabindex", 0)
            .style("cursor", "pointer")
            .on("click", () => this.triggerDrill(DRILL_UP))
            .on("keydown", (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.triggerDrill(DRILL_UP);
                }
            });
        button.append("text").attr("fill", this.selectionColor).text("↑ Drill Up");
    }

    private activateDrillPoint(sourceIndices: number[]): void {
        const ids = this.getSelectionIds(sourceIndices);
        if (ids.length !== 1) return;
        this.selectionManager.select(ids[0], false).then(
            () => this.triggerDrill(DRILL_DOWN),
            () => this.announceInteractionError()
        );
    }

    private triggerDrill(drillType: powerbi.DrillType): void {
        try {
            this.host.drill({ roleName: "category", drillType });
        } catch {
            this.announceInteractionError();
        }
    }

    private getColors(): IBCSColors {
        if (this.host.colorPalette.isHighContrast === true) {
            return {
                actual: this.foreground,
                budget: this.foreground,
                previousYear: this.foreground,
                forecast: this.foreground,
                positiveVariance: this.foreground,
                negativeVariance: this.foreground
            };
        }
        const colors = this.formattingSettings.designCard;
        return {
            actual: colors.actualColor.value.value,
            budget: colors.budgetColor.value.value,
            previousYear: colors.previousYearColor.value.value,
            forecast: colors.forecastColor.value.value,
            positiveVariance: colors.positiveVarianceColor.value.value,
            negativeVariance: colors.negativeVarianceColor.value.value
        };
    }

    private hasComparisonData(data: ParsedData, comparisonType: ComparisonType): boolean {
        return comparisonType === "budget"
            ? data.hasBudget
            : comparisonType === "previousYear" ? data.hasPreviousYear : data.hasForecast;
    }

    private getComparisonLabel(comparisonType: ComparisonType): string {
        if (comparisonType === "previousYear") return "Previous Year";
        if (comparisonType === "forecast") return "Forecast";
        return "Plan";
    }

    private renderLandingPage(): void {
        const width = finiteDimension(Number(this.svg.attr("width")));
        const height = finiteDimension(Number(this.svg.attr("height")));
        this.svg.classed("landing", true).attr("aria-label", "Atlyn Variance Chart. Add data to begin.");
        const group = this.chartContainer.append("g").attr("aria-hidden", "true");
        group.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", this.background);
        group.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2 - 8)
            .attr("text-anchor", "middle")
            .attr("fill", this.foreground)
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .text("Atlyn Variance Chart");
        group.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2 + 14)
            .attr("text-anchor", "middle")
            .attr("fill", this.foreground)
            .attr("font-size", "11px")
            .text("Add Category and Actual fields to start");
    }

    private renderNoData(message: string): void {
        const width = finiteDimension(Number(this.svg.attr("width")));
        const height = finiteDimension(Number(this.svg.attr("height")));
        this.svg.attr("aria-label", `Atlyn Variance Chart. ${message}`);
        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", this.foreground)
            .attr("role", "status")
            .text(message);
    }

    private renderFailure(message: string): void {
        this.chartContainer.selectAll("*").remove();
        this.svg.attr("aria-label", `Atlyn Variance Chart error. ${message}`).attr("tabindex", 0);
        const width = finiteDimension(Number(this.svg.attr("width")));
        const height = finiteDimension(Number(this.svg.attr("height")));
        this.chartContainer.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", this.background)
            .attr("aria-hidden", "true");
        this.chartContainer.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", this.foreground)
            .attr("role", "alert")
            .text(message);
        this.announce(message);
    }

    private announce(message: string): void {
        this.statusRegion.textContent = message;
    }

    private announceInteractionError(): void {
        this.announce("The interaction could not be completed.");
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
