/**
 * Area Chart - Filled region under line series
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

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

        const { dataPoints, hasBudget, hasPreviousYear, hasForecast } = this.data;
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);
        this.renderTitle();

        const series: Array<{ key: string; color: string; label: string; opacity: number }> = [
            { key: "actual", color: this.settings.colors.actual, label: "Actual", opacity: 0.4 }
        ];
        if (hasBudget) series.push({ key: "budget", color: this.settings.colors.budget, label: "Budget", opacity: 0.2 });
        if (hasPreviousYear) series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year", opacity: 0.2 });
        if (hasForecast) series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", opacity: 0.2 });

        const localMax = d3.max(dataPoints, d =>
            Math.max(d.actual, d.budget, d.previousYear, d.forecast)
        ) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([this.chartHeight, 0]);

        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        const showLabels = this.settings.dataLabels?.show ?? false;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        // Render areas (back to front so Actual is on top)
        const reversedSeries = [...series].reverse();
        reversedSeries.forEach(s => {
            const seriesData = dataPoints
                .map(d => ({ x: d.category, y: d[s.key] as number || 0 }))
                .filter(d => d.y > 0);

            if (seriesData.length > 0) {
                // Filled area
                const area = d3.area<{ x: string; y: number }>()
                    .x(d => (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                    .y0(this.chartHeight)
                    .y1(d => yScale(d.y));

                this.container.append("path")
                    .datum(seriesData)
                    .attr("fill", s.color)
                    .attr("fill-opacity", s.opacity)
                    .attr("d", area);

                // Line on top
                const line = d3.line<{ x: string; y: number }>()
                    .x(d => (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                    .y(d => yScale(d.y));

                this.container.append("path")
                    .datum(seriesData)
                    .attr("fill", "none")
                    .attr("stroke", s.color)
                    .attr("stroke-width", 2)
                    .attr("d", line);

                // Data labels on actual series
                if (showLabels && s.key === "actual") {
                    seriesData.forEach(d => {
                        this.container.append("text")
                            .attr("x", (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                            .attr("y", yScale(d.y) - 8)
                            .attr("text-anchor", "middle")
                            .attr("fill", s.color)
                            .attr("font-size", `${fontSize}px`)
                            .text(this.formatValue(d.y));
                    });
                }
            }
        });

        this.renderLegend(series.map(s => ({ label: s.label, color: s.color })));
        this.renderCommentBox();
    }
}
