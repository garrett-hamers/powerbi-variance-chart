/**
 * Variance Chart - IBCS-compliant variance comparison chart
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class VarianceChart extends BaseChart {
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

        this.createPatternDefs();

        const { dataPoints } = this.data;
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);

        // Render title
        this.renderTitle();

        // Calculate max value for scale
        const localMax = d3.max(dataPoints, d => {
            const comparison = this.getComparisonForPoint(d);
            const variance = Math.abs(this.getVarianceForPoint(d));
            return Math.max(d.actual, comparison, variance);
        }) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        // Scales
        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.3);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.15])
            .range([this.chartHeight, 0]);

        // Render axes
        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        // Bar width calculation (3 bars per category)
        const barWidth = xScale.bandwidth() / 3.5;

        const actualValues = dataPoints.map(p => p.actual);

        // Draw bars for each data point
        dataPoints.forEach((d, i) => {
            const xPos = xScale(d.category) || 0;
            const comparison = this.getComparisonForPoint(d);
            const variance = this.getVarianceForPoint(d);

            // Comparison bar (IBCS style varies by comparison type)
            const compBar = this.container.append("rect")
                .attr("data-dp-index", String(i))
                .attr("x", xPos)
                .attr("y", yScale(comparison))
                .attr("width", barWidth)
                .attr("height", Math.max(0, this.chartHeight - yScale(comparison)));

            if (this.settings.comparisonType === "forecast") {
                compBar
                    .attr("fill", "url(#forecast-hatch)")
                    .attr("stroke", this.settings.colors.forecast)
                    .attr("stroke-width", 1);
            } else if (this.settings.comparisonType === "previousYear") {
                compBar
                    .attr("fill", this.settings.colors.previousYear)
                    .attr("opacity", 0.4);
            } else {
                compBar
                    .attr("fill", "none")
                    .attr("stroke", this.settings.colors.budget)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "4,2");
            }

            // Actual bar (solid - IBCS style)
            this.container.append("rect")
                .attr("data-dp-index", String(i))
                .attr("x", xPos + barWidth + 2)
                .attr("y", yScale(d.actual))
                .attr("width", barWidth)
                .attr("height", Math.max(0, this.chartHeight - yScale(d.actual)))
                .attr("fill", this.settings.colors.actual);

            // Variance bar
            const varianceColor = this.getVarianceColorForPoint(d);
            const absVariance = Math.abs(variance);
            const varianceHeight = Math.abs(yScale(0) - yScale(absVariance));

            this.container.append("rect")
                .attr("data-dp-index", String(i))
                .attr("x", xPos + (barWidth + 2) * 2)
                .attr("y", yScale(absVariance))
                .attr("width", barWidth)
                .attr("height", Math.max(0, varianceHeight))
                .attr("fill", varianceColor);

            // Data labels
            if (this.settings.dataLabels.show && this.shouldShowLabel(i, dataPoints.length, actualValues)) {
                // Value label on actual bar
                if (this.settings.dataLabels.showValues) {
                    this.container.append("text")
                        .attr("x", xPos + barWidth + 2 + barWidth / 2)
                        .attr("y", yScale(d.actual) - 5)
                        .attr("text-anchor", "middle")
                        .attr("fill", this.settings.colors.actual)
                        .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                        .text(this.formatValue(d.actual));
                }

                // Variance label
                if (this.settings.dataLabels.showVariance) {
                    const labelText = this.formatVarianceLabel(d);

                    this.container.append("text")
                        .attr("x", xPos + (barWidth + 2) * 2 + barWidth / 2)
                        .attr("y", yScale(absVariance) - 5)
                        .attr("text-anchor", "middle")
                        .attr("fill", varianceColor)
                        .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                        .attr("font-weight", "bold")
                        .text(labelText);
                }
            }
        });

        // Legend
        const comparisonLabel = this.getComparisonLabel();
        this.renderLegend([
            { label: comparisonLabel, color: this.settings.colors.budget, outlined: true },
            { label: "Actual", color: this.settings.colors.actual },
            { label: "+Variance", color: this.settings.colors.positiveVariance },
            { label: "-Variance", color: this.settings.colors.negativeVariance }
        ]);

        // Render Comment Box
        this.renderCommentBox();
    }

    private getComparisonLabel(): string {
        switch (this.settings.comparisonType) {
            case "previousYear": return "Previous Year";
            case "forecast": return "Forecast";
            default: return "Plan";
        }
    }
}
