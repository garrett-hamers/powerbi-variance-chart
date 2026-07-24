/**
 * Line Chart - Single and multi-series line charts
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue, MeasureKey } from "../dataParser";

interface Series {
    key: MeasureKey;
    color: string;
    label: string;
    dashed?: boolean;
}

interface LinePoint {
    key: string;
    value: FiniteValue;
    sourceIndex: number | null;
    sourceIndices: number[];
    position: number;
}

export class LineChart extends BaseChart {
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

        const series: Series[] = [{ key: "actual", color: this.settings.colors.actual, label: "Actual" }];
        if (this.data.hasBudget) series.push({ key: "budget", color: this.settings.colors.budget, label: "Plan", dashed: true });
        if (this.data.hasPreviousYear) series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year" });
        if (this.data.hasForecast) series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", dashed: true });

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

        const showLabels = (this.settings.dataLabels?.show ?? this.settings.showVarianceLabels)
            && this.settings.dataLabels.showValues;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        series.forEach(item => {
            const lineData: LinePoint[] = dataPoints.map((point, position) => ({
                key: this.pointKey(point, position),
                value: point[item.key],
                sourceIndex: point.index,
                sourceIndices: point.sourceIndices,
                position
            }));
            const line = d3.line<LinePoint>()
                .defined(point => point.value !== null)
                .x(point => (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                .y(point => yScale(point.value as number));
            const path = line(lineData);
            if (path) {
                this.container.append("path")
                    .attr("fill", "none")
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", this.settings.highContrast
                        ? item.key === "actual" ? "none"
                            : item.key === "budget" ? "6,3"
                                : item.key === "previousYear" ? "2,2" : "8,2,2,2"
                        : item.dashed ? "5,3" : "none")
                    .attr("d", path);
            }

            const values = lineData.map(point => point.value);
            lineData.forEach(point => {
                if (point.value === null) return;
                const circle = this.container.append("circle")
                    .attr("data-dp-index", point.sourceIndex === null ? null : String(point.sourceIndex))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("cx", (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                    .attr("cy", yScale(point.value))
                    .attr("r", 4)
                    .attr("fill", this.settings.highContrast && item.key !== "actual"
                        ? this.settings.background
                        : item.color)
                    .attr("stroke", item.color);
                if (point.sourceIndex === null) circle.attr("class", "aggregate-point");
                if (showLabels && this.shouldShowLabel(point.position, lineData.length, values)) {
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
