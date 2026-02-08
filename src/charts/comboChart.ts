/**
 * Combo Chart - Columns for actuals + Lines for comparison series
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class ComboChart extends BaseChart {
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

        const { dataPoints, hasBudget, hasPreviousYear, hasForecast } = this.data;
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);
        this.renderTitle();

        // Columns for actuals, lines for comparisons
        const columnSeries: Array<{ key: string; color: string; label: string }> = [
            { key: "actual", color: this.settings.colors.actual, label: "Actual" }
        ];
        const lineSeries: Array<{ key: string; color: string; label: string; dashed: boolean }> = [];

        if (hasBudget) lineSeries.push({ key: "budget", color: this.settings.colors.budget, label: "Plan", dashed: true });
        if (hasPreviousYear) lineSeries.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year", dashed: false });
        if (hasForecast) lineSeries.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", dashed: true });

        const localMax = d3.max(dataPoints, d =>
            Math.max(d.actual, d.budget, d.previousYear, d.forecast)
        ) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([this.chartHeight, 0]);

        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        const showLabels = this.settings.dataLabels?.show ?? false;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        // Draw columns for actual values
        dataPoints.forEach(d => {
            const xPos = xScale(d.category) || 0;
            const value = d.actual;
            if (value > 0) {
                this.container.append("rect")
                    .attr("x", xPos)
                    .attr("y", yScale(value))
                    .attr("width", xScale.bandwidth())
                    .attr("height", Math.max(0, this.chartHeight - yScale(value)))
                    .attr("fill", this.settings.colors.actual);

                if (showLabels) {
                    this.container.append("text")
                        .attr("x", xPos + xScale.bandwidth() / 2)
                        .attr("y", yScale(value) - 5)
                        .attr("text-anchor", "middle")
                        .attr("fill", this.settings.colors.actual)
                        .attr("font-size", `${fontSize}px`)
                        .text(this.formatValue(value));
                }
            }
        });

        // Draw lines for comparison series
        lineSeries.forEach(s => {
            const lineData = dataPoints
                .map(d => ({ x: d.category, y: d[s.key] as number || 0 }))
                .filter(d => d.y > 0);

            if (lineData.length > 0) {
                const line = d3.line<{ x: string; y: number }>()
                    .x(d => (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                    .y(d => yScale(d.y));

                this.container.append("path")
                    .datum(lineData)
                    .attr("fill", "none")
                    .attr("stroke", s.color)
                    .attr("stroke-width", 2.5)
                    .attr("stroke-dasharray", s.dashed ? "6,3" : "none")
                    .attr("d", line);

                // Data points on line
                lineData.forEach(d => {
                    this.container.append("circle")
                        .attr("cx", (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                        .attr("cy", yScale(d.y))
                        .attr("r", 4)
                        .attr("fill", s.color);
                });
            }
        });

        // Legend items
        const allLegend = [
            ...columnSeries.map(s => ({ label: s.label, color: s.color })),
            ...lineSeries.map(s => ({ label: s.label, color: s.color }))
        ];
        this.renderLegend(allLegend);
        this.renderCommentBox();
    }
}
