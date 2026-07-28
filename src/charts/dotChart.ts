/**
 * Dot Chart - Actual/comparison dots with variance encoding
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue } from "../dataParser";

interface DotPoint {
    key: string;
    value: FiniteValue;
}

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
        const comparisonPresentation = this.getComparisonPresentation();
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();
        const xScale = d3.scaleBand<string>().domain(this.categoryKeys()).range([0, this.chartWidth]).padding(0.3);
        const yScale = this.createValueScale(
            dataPoints.flatMap(point => [point.actual, this.getComparisonForPoint(point)]),
            [this.chartHeight, 0],
            0.15
        );
        this.renderXAxis(xScale, this.chartHeight, this.categoryLabels());
        this.renderYAxis(yScale);

        if (comparisonPresentation) {
            const comparisonData: DotPoint[] = dataPoints.map((point, position) => ({
                key: this.pointKey(point, position),
                value: this.getComparisonForPoint(point)
            }));
            const line = d3.line<DotPoint>()
                .defined(point => point.value !== null)
                .x(point => (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                .y(point => yScale(point.value as number));
            const path = line(comparisonData);
            if (path) {
                this.container.append("path")
                    .attr("fill", "none")
                    .attr("stroke", comparisonPresentation.color)
                    .attr("stroke-width", 1.5)
                    .attr("stroke-dasharray", "4,3")
                    .attr("d", path);
            }
        }

        const showLabels = this.settings.dataLabels?.show ?? false;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const varianceValues = dataPoints.map(point => this.getVarianceForPoint(point));

        this.planAutoLabels(
            dataPoints.map((point, position) => ({
                index: position,
                center: (xScale(this.pointKey(point, position)) ?? 0) + xScale.bandwidth() / 2,
                text: this.formatVarianceLabel(point)
            })),
            varianceValues
        );

        dataPoints.forEach((point, position) => {
            const cx = (xScale(this.pointKey(point, position)) ?? 0) + xScale.bandwidth() / 2;
            const comparison = this.getComparisonForPoint(point);
            const varianceColor = this.getVarianceColorForPoint(point);
            const sourceIndex = point.index === null ? null : String(point.index);
            const sourceIndices = point.sourceIndices.join(",");

            if (comparisonPresentation && comparison !== null) {
                this.container.append("circle")
                    .attr("data-dp-index", sourceIndex)
                    .attr("data-source-indices", sourceIndices)
                    .attr("cx", cx).attr("cy", yScale(comparison)).attr("r", 5)
                    .attr("fill", "none")
                    .attr("stroke", comparisonPresentation.color)
                    .attr("stroke-width", 2);
            }
            if (point.actual === null) return;
            const pct = this.getVariancePctForPoint(point);
            const dotRadius = pct === null ? 5 : Math.min(12, Math.max(5, 5 + Math.abs(pct) / 10));
            this.container.append("circle")
                .attr("data-dp-index", sourceIndex)
                .attr("data-source-indices", sourceIndices)
                .attr("cx", cx).attr("cy", yScale(point.actual)).attr("r", dotRadius)
                .attr("fill", this.settings.highContrast && this.getVarianceForPoint(point) !== null
                    && (this.getVarianceForPoint(point) ?? 0) < 0
                    ? this.settings.background
                    : varianceColor)
                .attr("fill-opacity", 0.8)
                .attr("stroke", varianceColor).attr("stroke-width", 1.5);
            if (comparison !== null) {
                this.container.append("line")
                    .attr("x1", cx).attr("x2", cx)
                    .attr("y1", yScale(comparison)).attr("y2", yScale(point.actual))
                    .attr("stroke", varianceColor).attr("stroke-width", 1.5)
                    .attr("stroke-dasharray", this.settings.highContrast
                        && this.getVarianceForPoint(point) !== null
                        && (this.getVarianceForPoint(point) ?? 0) < 0
                        ? "2,2"
                        : "5,2");
            }
            const varianceLabel = this.formatVarianceLabel(point);
            if (
                showLabels
                && comparisonPresentation
                && varianceLabel
                && this.shouldShowLabel(position, dataPoints.length, varianceValues)
            ) {
                this.container.append("text")
                    .attr("x", cx).attr("y", yScale(point.actual) - dotRadius - 4)
                    .attr("text-anchor", "middle").attr("fill", varianceColor)
                    .attr("font-size", `${fontSize}px`).attr("font-weight", "bold")
                    .text(varianceLabel);
            }
        });

        this.renderCommentMarkers(xScale, yScale);
        const legend: Array<{ label: string; color: string; outlined?: boolean }> = [
            { label: "Actual", color: this.settings.colors.actual }
        ];
        if (comparisonPresentation) {
            legend.unshift({ label: comparisonPresentation.label, color: comparisonPresentation.color, outlined: true });
            legend.push(
                { label: "+Variance", color: this.settings.colors.positiveVariance },
                { label: "−Variance", color: this.settings.colors.negativeVariance }
            );
        }
        this.renderLegend(legend);
        this.renderCommentBox();
    }
}
