/**
 * Dot Chart - Action dots for variance visualization (ZebraBI-style)
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class DotChart extends BaseChart {
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
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);
        this.renderTitle();

        const localMax = d3.max(dataPoints, d => {
            const comparison = this.getComparisonForPoint(d);
            return Math.max(d.actual, comparison);
        }) || 0;
        const maxValue = this.getEffectiveMax(localMax);

        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartWidth])
            .padding(0.3);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.15])
            .range([this.chartHeight, 0]);

        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        const showLabels = this.settings.dataLabels?.show ?? false;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        // Draw reference line connecting comparison values
        const comparisonData = dataPoints.map(d => ({
            x: d.category,
            y: this.getComparisonForPoint(d)
        })).filter(d => d.y > 0);

        if (comparisonData.length > 0) {
            const line = d3.line<{ x: string; y: number }>()
                .x(d => (xScale(d.x) || 0) + xScale.bandwidth() / 2)
                .y(d => yScale(d.y));

            this.container.append("path")
                .datum(comparisonData)
                .attr("fill", "none")
                .attr("stroke", this.settings.colors.budget)
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", "4,3")
                .attr("d", line);
        }

        // Draw dots for each data point
        dataPoints.forEach((d, di) => {
            const cx = (xScale(d.category) || 0) + xScale.bandwidth() / 2;
            const comparison = this.getComparisonForPoint(d);
            const variance = this.getVarianceForPoint(d);
            const varianceColor = this.getVarianceColorForPoint(d);

            // Comparison dot (hollow)
            if (comparison > 0) {
                this.container.append("circle")
                    .attr("data-dp-index", String(di))
                    .attr("cx", cx)
                    .attr("cy", yScale(comparison))
                    .attr("r", 5)
                    .attr("fill", "none")
                    .attr("stroke", this.settings.colors.budget)
                    .attr("stroke-width", 2);
            }

            // Actual dot (filled, sized by variance magnitude)
            const absVariancePct = Math.abs(this.getVariancePctForPoint(d));
            const dotRadius = Math.min(12, Math.max(5, 5 + absVariancePct / 10));

            this.container.append("circle")
                .attr("data-dp-index", String(di))
                .attr("cx", cx)
                .attr("cy", yScale(d.actual))
                .attr("r", dotRadius)
                .attr("fill", varianceColor)
                .attr("fill-opacity", 0.8)
                .attr("stroke", varianceColor)
                .attr("stroke-width", 1.5);

            // Connecting line between comparison and actual
            if (comparison > 0 && d.actual > 0) {
                this.container.append("line")
                    .attr("x1", cx)
                    .attr("x2", cx)
                    .attr("y1", yScale(comparison))
                    .attr("y2", yScale(d.actual))
                    .attr("stroke", varianceColor)
                    .attr("stroke-width", 1.5)
                    .attr("stroke-dasharray", "2,2");
            }

            // Labels
            if (showLabels) {
                // Variance percentage label
                const labelText = this.formatVarianceLabel(d);
                this.container.append("text")
                    .attr("x", cx)
                    .attr("y", yScale(d.actual) - dotRadius - 4)
                    .attr("text-anchor", "middle")
                    .attr("fill", varianceColor)
                    .attr("font-size", `${fontSize}px`)
                    .attr("font-weight", "bold")
                    .text(labelText);
            }
        });

        const comparisonLabel = this.getComparisonLabel();
        this.renderLegend([
            { label: comparisonLabel, color: this.settings.colors.budget, outlined: true },
            { label: "Actual", color: this.settings.colors.actual },
            { label: "+Variance", color: this.settings.colors.positiveVariance },
            { label: "-Variance", color: this.settings.colors.negativeVariance }
        ]);
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
