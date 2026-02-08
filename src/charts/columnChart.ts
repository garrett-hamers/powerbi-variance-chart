/**
 * Column Chart - Standard and stacked column charts
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class ColumnChart extends BaseChart {
    private stacked: boolean;

    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: ChartSettings,
        dimensions: ChartDimensions,
        stacked: boolean = false
    ) {
        super(container, data, settings, dimensions);
        this.stacked = stacked;
    }

    render(): void {
        if (this.chartWidth <= 0 || this.chartHeight <= 0) return;

        const { dataPoints, hasBudget, hasPreviousYear, hasForecast } = this.data;
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);

        // Render title if enabled
        this.renderTitle();

        // Determine which series to show
        const series: Array<{ key: string; color: string; label: string }> = [
            { key: "actual", color: this.settings.colors.actual, label: "Actual" }
        ];
        
        if (hasBudget) {
            series.push({ key: "budget", color: this.settings.colors.budget, label: "Budget" });
        }
        if (hasPreviousYear) {
            series.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year" });
        }
        if (hasForecast) {
            series.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast" });
        }

        // Calculate max value
        const localMax = d3.max(dataPoints, d => {
            if (this.stacked) {
                return d.actual + d.budget + d.previousYear + d.forecast;
            }
            return Math.max(d.actual, d.budget, d.previousYear, d.forecast);
        }) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        // Scales
        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([this.chartHeight, 0]);

        // Render axes
        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        if (this.stacked) {
            this.renderStacked(dataPoints, series, xScale, yScale);
        } else {
            this.renderGrouped(dataPoints, series, xScale, yScale);
        }

        // Legend
        this.renderLegend(series.map(s => ({ label: s.label, color: s.color })));

        // Render Comment Box
        this.renderCommentBox();
    }

    private renderGrouped(
        dataPoints: any[],
        series: Array<{ key: string; color: string; label: string }>,
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const barWidth = xScale.bandwidth() / series.length;
        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        const allValues = dataPoints.map(d => d.actual || 0);

        dataPoints.forEach((d, di) => {
            const xPos = xScale(d.category) || 0;

            series.forEach((s, i) => {
                const value = d[s.key] || 0;
                if (value > 0) {
                    this.container.append("rect")
                        .attr("data-dp-index", String(di))
                        .attr("x", xPos + i * barWidth)
                        .attr("y", yScale(value))
                        .attr("width", barWidth - 2)
                        .attr("height", Math.max(0, this.chartHeight - yScale(value)))
                        .attr("fill", s.color);

                    // Data labels
                    if (showLabels && this.shouldShowLabel(di, dataPoints.length, allValues)) {
                        this.container.append("text")
                            .attr("x", xPos + i * barWidth + (barWidth - 2) / 2)
                            .attr("y", yScale(value) - 5)
                            .attr("text-anchor", "middle")
                            .attr("fill", s.color)
                            .attr("font-size", `${fontSize}px`)
                            .text(this.formatValue(value));
                    }
                }
            });
        });
    }

    private renderStacked(
        dataPoints: any[],
        series: Array<{ key: string; color: string; label: string }>,
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const barWidth = xScale.bandwidth();
        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        const allValues = dataPoints.map(d => d.actual || 0);

        dataPoints.forEach((d, di) => {
            const xPos = xScale(d.category) || 0;
            let stackBase = 0;

            series.forEach(s => {
                const value = d[s.key] || 0;
                if (value > 0) {
                    this.container.append("rect")
                        .attr("data-dp-index", String(di))
                        .attr("x", xPos)
                        .attr("y", yScale(stackBase + value))
                        .attr("width", barWidth)
                        .attr("height", Math.max(0, yScale(stackBase) - yScale(stackBase + value)))
                        .attr("fill", s.color);
                    stackBase += value;
                }
            });

            // Show total label on top of stack
            if (showLabels && stackBase > 0 && this.shouldShowLabel(di, dataPoints.length, allValues)) {
                this.container.append("text")
                    .attr("x", xPos + barWidth / 2)
                    .attr("y", yScale(stackBase) - 5)
                    .attr("text-anchor", "middle")
                    .attr("fill", this.settings.colors.actual)
                    .attr("font-size", `${fontSize}px`)
                    .text(this.formatValue(stackBase));
            }
        });
    }
}
