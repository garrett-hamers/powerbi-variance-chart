/**
 * Line Chart - Single and multi-series line charts
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

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

        const { dataPoints, hasBudget, hasPreviousYear, hasForecast } = this.data;
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);

        // Render title if enabled
        this.renderTitle();

        // Determine which series to show
        const series: Array<{ key: string; color: string; label: string; dashed?: boolean }> = [
            { key: "actual", color: this.settings.colors.actual, label: "Actual" }
        ];
        
        if (hasBudget) {
            series.push({ key: "budget", color: this.settings.colors.budget, label: "Budget", dashed: true });
        }
        if (hasPreviousYear) {
            series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year" });
        }
        if (hasForecast) {
            series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", dashed: true });
        }

        // Calculate max value
        const localMax = d3.max(dataPoints, d => 
            Math.max(d.actual, d.budget, d.previousYear, d.forecast)
        ) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        // Scales
        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([this.chartHeight, 0]);

        // Render axes
        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        // Render lines
        series.forEach(s => {
            const lineData = dataPoints
                .map((d, di) => ({ x: d.category, y: d[s.key] as number || 0, dpIndex: di }))
                .filter(d => d.y > 0);

            if (lineData.length > 0) {
                const line = d3.line<{ x: string; y: number }>()
                    .x(d => (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                    .y(d => yScale(d.y));

                this.container.append("path")
                    .datum(lineData)
                    .attr("fill", "none")
                    .attr("stroke", s.color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", s.dashed ? "5,3" : "none")
                    .attr("d", line);

                // Data points
                const yValues = lineData.map(d => d.y);
                lineData.forEach((d, di) => {
                    this.container.append("circle")
                        .attr("data-dp-index", String(d.dpIndex))
                        .attr("cx", (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                        .attr("cy", yScale(d.y))
                        .attr("r", 4)
                        .attr("fill", s.color);

                    // Data labels
                    if (showLabels && this.shouldShowLabel(di, lineData.length, yValues)) {
                        this.container.append("text")
                            .attr("x", (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                            .attr("y", yScale(d.y) - 8)
                            .attr("text-anchor", "middle")
                            .attr("fill", s.color)
                            .attr("font-size", `${fontSize}px`)
                            .text(this.formatValue(d.y));
                    }
                });
            }
        });

        // Legend
        this.renderLegend(series.map(s => ({ label: s.label, color: s.color })));

        // Render Comment Box
        this.renderCommentBox();
    }
}
