/**
 * Area Chart - Filled region between each series and the zero baseline
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue, MeasureKey } from "../dataParser";

interface Series {
    key: MeasureKey;
    color: string;
    label: string;
    opacity: number;
}

interface AreaPoint {
    key: string;
    value: FiniteValue;
    sourceIndex: number | null;
    sourceIndices: number[];
    position: number;
}

export class AreaChart extends BaseChart {
    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: ChartSettings,
        dimensions: ChartDimensions
    ) {
        super(container, data, settings, dimensions);
    }

    render(): void {
        if (this.chartWidth <= 0 || this.chartHeight <= 0) return;
        const { dataPoints } = this.data;
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();

        const series: Series[] = [{ key: "actual", color: this.settings.colors.actual, label: "Actual", opacity: 0.4 }];
        if (this.data.hasBudget) series.push({ key: "budget", color: this.settings.colors.budget, label: "Plan", opacity: 0.2 });
        if (this.data.hasPreviousYear) series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year", opacity: 0.2 });
        if (this.data.hasForecast) series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", opacity: 0.2 });

        const xScale = d3.scaleBand<string>()
            .domain(this.categoryKeys())
            .range([0, this.chartWidth])
            .padding(0.1);
        const yScale = this.createValueScale(
            dataPoints.flatMap(point => series.map(item => point[item.key])),
            [this.chartHeight, 0]
        );
        this.renderXAxis(xScale, this.chartHeight, this.categoryLabels());
        this.renderYAxis(yScale);

        const showLabels = (this.settings.dataLabels?.show ?? false)
            && this.settings.dataLabels.showValues;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        [...series].reverse().forEach(item => {
            const areaData: AreaPoint[] = dataPoints.map((point, position) => ({
                key: this.pointKey(point, position),
                value: point[item.key],
                sourceIndex: point.index,
                sourceIndices: point.sourceIndices,
                position
            }));
            const area = d3.area<AreaPoint>()
                .defined(point => point.value !== null)
                .x(point => (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                .y0(yScale(0))
                .y1(point => yScale(point.value as number));
            const areaPath = area(areaData);
            if (areaPath) {
                this.container.append("path")
                    .attr("class", `area-series area-${item.key}`)
                    .attr("fill", this.settings.highContrast && item.key !== "actual" ? "none" : item.color)
                    .attr("fill-opacity", item.opacity)
                    .attr("d", areaPath);
            }

            const line = d3.line<AreaPoint>()
                .defined(point => point.value !== null)
                .x(point => (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                .y(point => yScale(point.value as number));
            const linePath = line(areaData);
            if (linePath) {
                this.container.append("path")
                    .attr("fill", "none")
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", this.settings.highContrast
                        ? item.key === "actual" ? "none"
                            : item.key === "budget" ? "6,3"
                                : item.key === "previousYear" ? "2,2" : "8,2,2,2"
                        : "none")
                    .attr("d", linePath);
            }

            const values = areaData.map(point => point.value);
            areaData.forEach(point => {
                if (point.value === null) return;
                const hitTarget = this.container.append("circle")
                    .attr("class", "area-hit-target")
                    .attr("data-dp-index", point.sourceIndex === null ? null : String(point.sourceIndex))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("cx", (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                    .attr("cy", yScale(point.value))
                    .attr("r", 8)
                    .attr("fill", "transparent")
                    .attr("pointer-events", "all")
                    .attr("aria-label", `${item.label}: ${this.formatValue(point.value, item.key)}`);
                if (point.sourceIndex === null) hitTarget.classed("aggregate-point", true);
                if (showLabels && item.key === "actual" && this.shouldShowLabel(point.position, areaData.length, values)) {
                    this.container.append("text")
                        .attr("x", (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                        .attr("y", yScale(point.value) - 8)
                        .attr("text-anchor", "middle")
                        .attr("fill", item.color)
                        .attr("font-size", `${fontSize}px`)
                        .text(this.formatValue(point.value, item.key));
                }
            });
        });

        this.renderCommentMarkers(xScale, yScale);
        this.renderLegend(series.map(item => ({ label: item.label, color: item.color })));
        this.renderCommentBox();
    }
}
