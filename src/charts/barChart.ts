/**
 * Bar Chart - Horizontal column chart
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class BarChart extends BaseChart {
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

        const series: Array<{ key: string; color: string; label: string }> = [
            { key: "actual", color: this.settings.colors.actual, label: "Actual" }
        ];
        if (hasBudget) series.push({ key: "budget", color: this.settings.colors.budget, label: "Plan" });
        if (hasPreviousYear) series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year" });
        if (hasForecast) series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast" });

        const localMax = d3.max(dataPoints, d =>
            Math.max(d.actual, d.budget, d.previousYear, d.forecast)
        ) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        // Y axis = categories, X axis = values
        const yScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartHeight])
            .padding(0.2);

        const xScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([0, this.chartWidth]);

        // Y Axis (categories)
        const catFontSize = this.settings.categories?.fontSize ?? this.settings.fontSize;
        const catFontColor = this.settings.categories?.fontColor ?? this.settings.fontColor;

        const yAxis = d3.axisLeft(yScale);
        this.container.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("font-size", `${catFontSize}px`)
            .style("fill", catFontColor);

        // X Axis (values)
        const xAxis = d3.axisBottom(xScale)
            .ticks(6)
            .tickFormat(d => this.formatValue(d as number));
        this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${this.chartHeight})`)
            .call(xAxis)
            .selectAll("text")
            .style("font-size", `${catFontSize}px`)
            .style("fill", catFontColor);

        const showLabels = this.settings.dataLabels?.show ?? false;
        const labelFontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const barHeight = yScale.bandwidth() / series.length;

        const barValues = dataPoints.map(d => d.actual || 0);

        // Draw horizontal bars
        dataPoints.forEach((d, di) => {
            const yPos = yScale(d.category) || 0;

            series.forEach((s, i) => {
                const value = d[s.key] as number || 0;
                if (value > 0) {
                    this.container.append("rect")
                        .attr("x", 0)
                        .attr("y", yPos + i * barHeight)
                        .attr("width", xScale(value))
                        .attr("height", barHeight - 2)
                        .attr("fill", s.color);

                    if (showLabels && this.shouldShowLabel(di, dataPoints.length, barValues)) {
                        this.container.append("text")
                            .attr("x", xScale(value) + 5)
                            .attr("y", yPos + i * barHeight + barHeight / 2 + 4)
                            .attr("text-anchor", "start")
                            .attr("fill", s.color)
                            .attr("font-size", `${labelFontSize}px`)
                            .text(this.formatValue(value));
                    }
                }
            });
        });

        this.renderLegend(series.map(s => ({ label: s.label, color: s.color })));
        this.renderCommentBox();
    }
}
