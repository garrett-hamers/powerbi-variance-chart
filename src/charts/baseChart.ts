/**
 * Base Chart - Abstract class for all chart types
 */
import * as d3 from "d3";
import {
    DataPoint,
    ParsedData,
    ComparisonType,
    FiniteValue,
    MeasureKey,
    getAvailableComparisonType,
    getVariance,
    getVariancePct,
    getComparisonValue
} from "../dataParser";
import { IBCSColors, getVarianceColor } from "../utils/colors";
import { formatNumber, formatPercent, NumberScale } from "../utils/formatting";
import { getCommentBoxPosition, getLegendPosition } from "../layoutEngine";

export interface TitleSettings {
    show: boolean;
    text: string;
    fontSize: number;
    fontColor: string;
    alignment: "left" | "center" | "right";
}

export interface DataLabelSettings {
    show: boolean;
    showValues: boolean;
    showVariance: boolean;
    showPercentage: boolean;
    fontSize: number;
    decimalPlaces: number;
    displayUnits: NumberScale;
    negativeFormat: "minus" | "parentheses";
    labelDensity: "all" | "firstLast" | "minMax" | "none";
}

export interface CategorySettings {
    show: boolean;
    fontSize: number;
    fontColor: string;
    rotation: number;
    maxWidth: number;
}

export interface LegendSettings {
    show: boolean;
    position: "top" | "bottom" | "left" | "right";
    fontSize: number;
}

export interface CommentBoxSettings {
    show: boolean;
    showVariance: string;
    varianceIcon: string;
    padding: number;
    gap: number;
    fontSize: number;
    fontColor: string;
    markerSize: number;
    markerColor: string;
}

export interface DifferenceHighlightSettings {
    show: boolean;
    threshold: number;
    highlightPositive: boolean;
    highlightNegative: boolean;
}

export interface ChartSettings {
    // Chart behavior
    invertVariance: boolean;
    comparisonType: ComparisonType;
    colors: IBCSColors;
    foreground: string;
    background: string;
    highContrast: boolean;
    /** Raw finite domain shared by small-multiple cells. */
    sharedValueDomain?: [number, number];
    /** Stable magnitude used by Auto display units throughout this visual. */
    displayUnitReference?: number;
    
    // Title
    title: TitleSettings;
    
    // Data labels
    dataLabels: DataLabelSettings;
    
    // Categories (X-axis)
    categories: CategorySettings;
    
    // Legend
    legend: LegendSettings;

    // Comment Box
    commentBox: CommentBoxSettings;
    
    // Difference highlighting
    highlighting: DifferenceHighlightSettings;

    // Axis break
    axisBreak: { show: boolean; breakValue: number };
    
    // Legacy compatibility
    showVarianceLabels: boolean;
    showPercentage: boolean;
    fontSize: number;
    fontColor: string;
    /** Host locale. visual.ts should pass IVisualHost.locale. */
    locale?: string;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ChartLayout {
    titleArea?: Rect;
    legendArea?: Rect;
    commentBoxArea?: Rect;
    chartArea: Rect;
}

export interface ChartDimensions {
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
    layout?: ChartLayout;
}

export abstract class BaseChart {
    private static nextInstanceId = 0;
    protected container: d3.Selection<SVGGElement, unknown, null, undefined>;
    protected data: ParsedData;
    protected settings: ChartSettings;
    protected dimensions: ChartDimensions;
    protected readonly instanceId: string;
    protected readonly forecastPatternId: string;

    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: ChartSettings,
        dimensions: ChartDimensions
    ) {
        this.container = container;
        this.data = data;
        this.settings = settings;
        this.dimensions = dimensions;
        this.instanceId = `atlyn-chart-${BaseChart.nextInstanceId++}`;
        this.forecastPatternId = `${this.instanceId}-forecast-hatch`;
    }

    abstract render(): void;

    protected get chartWidth(): number {
        return Math.max(0, this.dimensions.width - this.dimensions.margin.left - this.dimensions.margin.right);
    }

    protected get chartHeight(): number {
        return Math.max(0, this.dimensions.height - this.dimensions.margin.top - this.dimensions.margin.bottom);
    }

    protected getComparisonType(): ComparisonType | null {
        return getAvailableComparisonType(this.data, this.settings.comparisonType);
    }

    protected getComparisonPresentation(): { key: ComparisonType; color: string; label: string } | null {
        const key = this.getComparisonType();
        if (key === null) return null;
        switch (key) {
            case "previousYear":
                return { key, color: this.settings.colors.previousYear, label: "Previous Year" };
            case "forecast":
                return { key, color: this.settings.colors.forecast, label: "Forecast" };
            default:
                return { key, color: this.settings.colors.budget, label: "Plan" };
        }
    }

    protected getVarianceForPoint(d: DataPoint): FiniteValue {
        const comparisonType = this.getComparisonType();
        if (comparisonType === null) return null;
        let variance = getVariance(d, comparisonType);
        if (variance === null) return null;
        if (this.settings.invertVariance) {
            variance = -variance;
        }
        return variance;
    }

    protected getVariancePctForPoint(d: DataPoint): FiniteValue {
        const comparisonType = this.getComparisonType();
        if (comparisonType === null) return null;
        let pct = getVariancePct(d, comparisonType);
        if (pct === null) return null;
        if (this.settings.invertVariance) {
            pct = -pct;
        }
        return pct;
    }

    protected getComparisonForPoint(d: DataPoint): FiniteValue {
        const comparisonType = this.getComparisonType();
        return comparisonType === null ? null : getComparisonValue(d, comparisonType);
    }

    protected getVarianceColorForPoint(d: DataPoint): string {
        if (this.settings.highContrast) return this.settings.foreground;
        const variance = this.getVarianceForPoint(d);
        if (variance === null || variance === 0) return this.settings.colors.actual;
        const rawPct = this.getVariancePctForPoint(d);
        const pct = rawPct === null ? Number.POSITIVE_INFINITY : Math.abs(rawPct);
        
        // Apply highlighting threshold
        if (this.settings.highlighting.show) {
            if (pct < this.settings.highlighting.threshold) {
                return this.settings.colors.actual; // Use neutral color below threshold
            }
            if (variance > 0 && !this.settings.highlighting.highlightPositive) {
                return this.settings.colors.actual;
            }
            if (variance < 0 && !this.settings.highlighting.highlightNegative) {
                return this.settings.colors.actual;
            }
        }
        
        return getVarianceColor(variance, this.settings.colors);
    }

    protected formatValue(value: FiniteValue, measure: MeasureKey = "actual"): string {
        return formatNumber(value, { 
            scale: this.settings.dataLabels.displayUnits, 
            decimals: this.settings.dataLabels.decimalPlaces,
            negativeFormat: this.settings.dataLabels.negativeFormat,
            format: this.data.formats[measure],
            locale: this.settings.locale ?? this.data.locale,
            representativeValue: this.settings.displayUnitReference
        });
    }

    protected formatVarianceValues(variance: FiniteValue, percentage: FiniteValue): string {
        const labels: string[] = [];
        if (this.settings.dataLabels.showVariance && variance !== null) {
            labels.push(formatNumber(variance, {
                scale: this.settings.dataLabels.displayUnits,
                decimals: this.settings.dataLabels.decimalPlaces,
                showSign: true,
                negativeFormat: this.settings.dataLabels.negativeFormat,
                format: this.data.formats.actual,
                locale: this.settings.locale ?? this.data.locale,
                representativeValue: this.settings.displayUnitReference
            }));
        }
        if (this.settings.dataLabels.showPercentage && percentage !== null) {
            const formatted = formatPercent(
                percentage,
                this.settings.dataLabels.decimalPlaces,
                true,
                this.settings.locale ?? this.data.locale
            );
            labels.push(labels.length > 0 ? `(${formatted})` : formatted);
        }
        return labels.join(" ");
    }

    protected formatVarianceLabel(d: DataPoint): string {
        return this.formatVarianceValues(
            this.getVarianceForPoint(d),
            this.getVariancePctForPoint(d)
        );
    }

    protected finiteValues(values: FiniteValue[]): number[] {
        return values.filter((value): value is number => value !== null && Number.isFinite(value));
    }

    protected getValueDomain(values: FiniteValue[], padding = 0.1): [number, number] {
        let min = 0;
        let max = 0;
        for (const value of values) {
            if (value !== null && Number.isFinite(value)) {
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }
        if (min === 0 && max === 0) return [-1, 1];
        if (min < 0) {
            const padded = min * (1 + padding);
            if (Number.isFinite(padded)) min = padded;
        }
        if (max > 0) {
            const padded = max * (1 + padding);
            if (Number.isFinite(padded)) max = padded;
        }
        if (min === max) {
            return min === 0 ? [-1, 1] : min > 0 ? [0, min] : [min, 0];
        }
        return [min, max];
    }

    protected createValueScale(
        values: FiniteValue[],
        range: [number, number],
        padding = 0.1
    ): d3.ScaleLinear<number, number> {
        const domainValues = this.settings.sharedValueDomain ?? values;
        const [min, max] = this.getValueDomain(domainValues, padding);
        if (min < 0 && max > 0 && !Number.isFinite(max - min)) {
            const magnitude = Math.max(Math.abs(min), max);
            const negativeRatio = Math.abs(min) / magnitude;
            const positiveRatio = max / magnitude;
            const zeroFraction = negativeRatio / (negativeRatio + positiveRatio);
            const zeroRange = range[0] + (range[1] - range[0]) * zeroFraction;
            return d3.scaleLinear()
                .domain([min, 0, max])
                .range([range[0], zeroRange, range[1]]);
        }
        return d3.scaleLinear().domain([min, max]).range(range);
    }

    protected pointKey(point: DataPoint, position: number): string {
        return point.index === null
            ? `aggregate-${position}-${point.sourceIndices.join("-")}`
            : `row-${point.index}`;
    }

    protected categoryKeys(): string[] {
        return this.data.dataPoints.map((point, index) => this.pointKey(point, index));
    }

    protected categoryLabels(): Map<string, string> {
        return new Map(this.data.dataPoints.map((point, index) => [this.pointKey(point, index), point.category]));
    }

    /** Returns true if the label at index i should be shown based on labelDensity */
    protected shouldShowLabel(i: number, total: number, values: FiniteValue[]): boolean {
        const density = this.settings.dataLabels.labelDensity;
        if (density === "none") return false;
        if (density === "all") return true;
        if (density === "firstLast") return i === 0 || i === total - 1;
        if (density === "minMax") {
            if (values[i] === null) return false;
            let min = Number.POSITIVE_INFINITY;
            let max = Number.NEGATIVE_INFINITY;
            for (const value of values) {
                if (value !== null && Number.isFinite(value)) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            }
            if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
            return values[i] === min || values[i] === max;
        }
        return true;
    }

    protected renderTitle(): void {
        if (!this.settings.title.show || !this.settings.title.text) return;

        let x: number;
        // Title renders above the chart area, in the margin space
        const y: number = -this.dimensions.margin.top + 20; // 20px from top of viewport
        let anchor: string;

        switch (this.settings.title.alignment) {
            case "center": x = this.chartWidth / 2; anchor = "middle"; break;
            case "right": x = this.chartWidth; anchor = "end"; break;
            default: x = 0; anchor = "start";
        }

        this.container.append("text")
            .attr("class", "chart-title")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", anchor)
            .attr("font-size", `${this.settings.title.fontSize}px`)
            .attr("font-weight", "bold")
            .attr("fill", this.settings.title.fontColor)
            .text(this.settings.title.text);
    }

    protected renderXAxis(
        xScale: d3.ScaleBand<string>,
        yPosition: number,
        labels: Map<string, string> = new Map()
    ): void {
        if (!this.settings.categories.show) return;

        const xAxis = d3.axisBottom(xScale)
            .tickFormat(key => labels.get(String(key)) ?? String(key));
        
        const axisGroup = this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${yPosition})`)
            .call(xAxis);
        axisGroup.selectAll(".domain, line").attr("stroke", this.settings.foreground);
        
        const maxW = this.settings.categories.maxWidth;
        axisGroup.selectAll("text")
            .attr("transform", `rotate(${this.settings.categories.rotation})`)
            .style(
                "text-anchor",
                this.settings.categories.rotation === 0
                    ? "middle"
                    : this.settings.categories.rotation < 0 ? "end" : "start"
            )
            .style("font-size", `${this.settings.categories.fontSize}px`)
            .style("fill", this.settings.categories.fontColor)
            .each(function() {
                const self = d3.select(this);
                const fullText = self.text();
                if (maxW > 0) {
                    // Truncate to fit within maxWidth pixels
                    const node = self.node() as SVGTextElement;
                    self.text(fullText);
                    if (node.getComputedTextLength() > maxW) {
                        let truncated = fullText;
                        while (truncated.length > 1 && node.getComputedTextLength() > maxW) {
                            truncated = truncated.slice(0, -1);
                            self.text(truncated + "…");
                        }
                    }
                }
            });
    }

    protected renderYAxis(
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const yAxis = d3.axisLeft(yScale)
            .ticks(6)
            .tickFormat(d => this.formatValue(d as number));
        
        const axisGroup = this.container.append("g")
            .attr("class", "y-axis")
            .call(yAxis);
        axisGroup.selectAll(".domain, line").attr("stroke", this.settings.foreground);
        axisGroup.selectAll("text")
            .style("font-size", `${this.settings.categories.fontSize}px`)
            .style("fill", this.settings.categories.fontColor);

        // Axis-break settings are represented as a marker only. The scale stays
        // continuous so marks, ticks, and hit targets cannot disagree.
        if (this.settings.axisBreak?.show && Number.isFinite(this.settings.axisBreak.breakValue)) {
            this.renderAxisBreak(yScale, this.settings.axisBreak.breakValue);
        }
    }

    protected renderLegend(items: Array<{ label: string; color: string; outlined?: boolean }>): void {
        if (!this.settings.legend.show) return;

        // Use the tested layout engine for positioning
        // Comment box is always on the right when shown
        const commentOnRight = this.settings.commentBox.show && this.data.hasComments;

        const pos = getLegendPosition(
            this.dimensions,
            this.settings.legend.position,
            commentOnRight,
            items.length
        );

        const direction: "horizontal" | "vertical" =
            (this.settings.legend.position === "top" || this.settings.legend.position === "bottom")
                ? "horizontal" : "vertical";

        const legend = this.container.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${pos.x}, ${pos.y})`);

        items.forEach((item, i) => {
            const x = direction === "horizontal" ? i * 70 : 0;
            const y = direction === "horizontal" ? 0 : i * 20;
            
            if (item.outlined) {
                legend.append("rect")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("width", 12)
                    .attr("height", 12)
                    .attr("fill", "none")
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "3,1");
            } else {
                legend.append("rect")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("width", 12)
                    .attr("height", 12)
                    .attr("fill", item.color);
            }

            legend.append("text")
                .attr("x", x + 18)
                .attr("y", y + 10)
                .attr("font-size", `${this.settings.legend.fontSize}px`)
                .attr("fill", this.settings.foreground)
                .text(item.label);
        });
    }

    protected renderCommentBox(): void {
        const { commentBox } = this.settings;
        if (!commentBox.show) return;

        const comments = this.data.dataPoints
            .map((d, i) => ({ dp: d, index: i }))
            .filter(({ dp }) => dp.comment && dp.comment.trim() !== "");
        if (comments.length === 0) return;

        const pos = getCommentBoxPosition(this.dimensions);
        if (!pos) return;

        const { x, y, boxWidth, boxHeight } = pos;
        if (boxWidth <= 0 || boxHeight <= 0) return;
        const markerSize = commentBox.markerSize || 18;
        const markerColor = commentBox.markerColor || this.settings.foreground;
        const fontSize = commentBox.fontSize;
        const padding = commentBox.padding;

        // Use foreignObject to enable native scrollbar
        const fo = this.container.append("foreignObject")
            .attr("class", "comment-box")
            .attr("x", x)
            .attr("y", y)
            .attr("width", boxWidth)
            .attr("height", boxHeight);

        const scrollDiv = fo.append("xhtml:div")
            .style("width", `${boxWidth}px`)
            .style("height", `${boxHeight}px`)
            .style("overflow-y", "auto")
            .style("overflow-x", "hidden")
            .style("font-family", "\"Segoe UI\", sans-serif")
            .style("color", this.settings.foreground)
            .style("background", this.settings.background)
            .style("box-sizing", "border-box");

        comments.forEach(({ dp, index }, commentNum) => {
            const num = commentNum + 1;
            const variance = this.getVarianceForPoint(dp);
            const pct = this.getVariancePctForPoint(dp);
            const isPositive = variance !== null && variance > 0;

            const card = scrollDiv.append("xhtml:div")
                .style("display", "flex")
                .style("align-items", "flex-start")
                .style("gap", `${padding}px`)
                .style("margin-bottom", `${commentBox.gap}px`)
                .style("padding", `${padding}px 0`);

            // Numbered circle marker
            card.append("xhtml:div")
                .attr("class", "comment-card-marker")
                .attr("data-comment-index", String(index))
                .attr("data-comment-source", dp.sourceIndices.join(","))
                .style("min-width", `${markerSize}px`)
                .style("width", `${markerSize}px`)
                .style("height", `${markerSize}px`)
                .style("border-radius", "50%")
                .style("border", `1.5px solid ${markerColor}`)
                .style("display", "flex")
                .style("align-items", "center")
                .style("justify-content", "center")
                .style("font-size", `${fontSize}px`)
                .style("font-weight", "bold")
                .style("color", markerColor)
                .style("flex-shrink", "0")
                .text(String(num));

            // Content column
            const content = card.append("xhtml:div")
                .style("flex", "1")
                .style("min-width", "0");

            // Line 1: Category label
            const label = dp.group ? `${dp.group}, ${dp.category}` : dp.category;
            content.append("xhtml:div")
                .style("font-size", `${fontSize + 1}px`)
                .style("font-weight", "bold")
                .style("color", commentBox.fontColor)
                .style("line-height", "1.3")
                .text(label);

            // Line 2: Value + variance + icon
            const valueStr = this.formatValue(dp.actual);
            let variancePart = "";
            if (
                variance !== null
                && (commentBox.showVariance === "absolute" || commentBox.showVariance === "both")
            ) {
                variancePart += ` ${this.formatValue(variance)}`;
            }
            if (
                pct !== null
                && (commentBox.showVariance === "relative" || commentBox.showVariance === "both")
            ) {
                variancePart += ` ${formatPercent(pct, 1, true, this.settings.locale ?? this.data.locale)}`;
            }

            const valueLine = content.append("xhtml:div")
                .style("font-size", `${fontSize}px`)
                .style("color", this.settings.foreground)
                .style("line-height", "1.4");

            valueLine.append("xhtml:span").text(`${valueStr}${variancePart}`);

            // Variance icon inline
            if (commentBox.varianceIcon !== "none" && commentBox.showVariance !== "none" && variance !== null && variance !== 0) {
                let icon = "";
                if (commentBox.varianceIcon === "triangle") icon = isPositive ? " \u25B2" : " \u25BC";
                else if (commentBox.varianceIcon === "arrow") icon = isPositive ? " \u2191" : " \u2193";
                else if (commentBox.varianceIcon === "circle") icon = " \u25CF";

                const iconColor = isPositive
                    ? this.settings.colors.positiveVariance
                    : this.settings.colors.negativeVariance;
                valueLine.append("xhtml:span")
                    .attr("class", "variance-icon")
                    .style("color", iconColor)
                    .style("font-size", `${fontSize + 2}px`)
                    .text(icon);
            }

            // Comment text
            if (dp.comment) {
                let commentText = dp.comment.trim();
                const categoryLower = dp.category.trim().toLowerCase();
                const commentLower = commentText.toLowerCase();
                if (
                    commentLower === categoryLower
                    || commentLower.startsWith(`${categoryLower}:`)
                    || commentLower.startsWith(`${categoryLower} -`)
                ) {
                    commentText = commentText.substring(categoryLower.length).trim().replace(/^[-:]\s*/, "");
                }
                if (commentText.length > 0) {
                    content.append("xhtml:div")
                        .style("font-size", `${Math.max(0, fontSize - 1)}px`)
                        .style("color", this.settings.foreground)
                        .style("line-height", "1.4")
                        .style("word-wrap", "break-word")
                        .text(commentText);
                }
            }
        });
    }

    /**
     * Render numbered circle markers on chart bars at data points that have comments.
     * Call this after rendering bars, passing the xScale so markers can be positioned.
     */
    protected renderCommentMarkers(
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const { commentBox } = this.settings;
        if (!commentBox.show) return;

        const comments = this.data.dataPoints
            .map((d, i) => ({ dp: d, index: i }))
            .filter(({ dp }) => dp.comment && dp.comment.trim() !== "");
        if (comments.length === 0) return;

        const markerSize = commentBox.markerSize || 18;
        const markerColor = commentBox.markerColor || this.settings.foreground;
        const fontSize = commentBox.fontSize;
        const bandWidth = xScale.bandwidth();

        comments.forEach(({ dp, index }, commentNum) => {
            const num = commentNum + 1;
            if (dp.actual === null) return;
            const cx = (xScale(this.pointKey(dp, index)) ?? 0) + bandWidth / 2;
            // Place marker just below the bar (or at the baseline if bar goes up)
            const barY = yScale(dp.actual);
            const baseY = yScale(0);
            const cy = Math.max(barY, baseY) + markerSize / 2 + 4;

            this.container.append("circle")
                .attr("cx", cx)
                .attr("cy", cy)
                .attr("r", markerSize / 2)
                .attr("fill", "none")
                .attr("stroke", markerColor)
                .attr("stroke-width", 1.5)
                .attr("class", "comment-marker")
                .attr("data-comment-index", index)
                .attr("data-comment-source", dp.sourceIndices.join(","));

            this.container.append("text")
                .attr("x", cx)
                .attr("y", cy + fontSize * 0.35)
                .attr("text-anchor", "middle")
                .attr("fill", markerColor)
                .attr("font-size", `${fontSize}px`)
                .attr("font-weight", "bold")
                .attr("class", "comment-marker-text")
                .attr("data-comment-index", index)
                .attr("data-comment-source", dp.sourceIndices.join(","))
                .text(String(num));
        });
    }

    protected renderAxisBreak(yScale: d3.ScaleLinear<number, number>, breakValue: number): void {
        if (!Number.isFinite(breakValue)) return;
        
        const y = yScale(breakValue);
        if (!Number.isFinite(y) || y < 0 || y > this.chartHeight) return;
        this.container.append("path")
            .attr("class", "axis-break-indicator")
            .attr("d", `M-7,${y - 3} L-2,${y + 3} L3,${y - 3} L8,${y + 3}`)
            .attr("stroke", this.settings.foreground)
            .attr("stroke-width", 1.5)
            .attr("fill", "none")
            .append("title")
            .text("Axis break marker; scale remains continuous");
    }

    protected renderHorizontalAxisBreak(
        xScale: d3.ScaleLinear<number, number>,
        breakValue: number
    ): void {
        if (!Number.isFinite(breakValue)) return;
        const x = xScale(breakValue);
        if (!Number.isFinite(x) || x < 0 || x > this.chartWidth) return;
        this.container.append("path")
            .attr("class", "axis-break-indicator")
            .attr(
                "d",
                `M${x - 3},${this.chartHeight - 7} L${x + 3},${this.chartHeight - 2} `
                + `L${x - 3},${this.chartHeight + 3} L${x + 3},${this.chartHeight + 8}`
            )
            .attr("stroke", this.settings.foreground)
            .attr("stroke-width", 1.5)
            .attr("fill", "none")
            .append("title")
            .text("Axis break marker; scale remains continuous");
    }

    protected createPatternDefs(): void {
        // Remove existing defs
        const defs = this.container.append("defs").attr("class", "ibcs-patterns");
        
        // Forecast hatch pattern
        const pattern = defs.append("pattern")
            .attr("id", this.forecastPatternId)
            .attr("width", 6)
            .attr("height", 6)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("patternTransform", "rotate(45)");
        
        pattern.append("rect")
            .attr("width", 6)
            .attr("height", 6)
            .attr("fill", this.settings.colors.forecast);
        
        pattern.append("line")
            .attr("x1", 0).attr("y1", 0)
            .attr("x2", 0).attr("y2", 6)
            .attr("stroke", this.settings.background)
            .attr("stroke-width", 2);
    }
}
