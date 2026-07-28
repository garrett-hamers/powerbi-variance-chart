/**
 * Variance Chart - IBCS-compliant variance comparison chart
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue } from "../dataParser";

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
        const comparisonPresentation = this.getComparisonPresentation();
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();

        const values: FiniteValue[] = dataPoints.flatMap(point => [
            point.actual,
            this.getComparisonForPoint(point),
            this.getVarianceForPoint(point)
        ]);
        const xScale = d3.scaleBand<string>()
            .domain(this.categoryKeys())
            .range([0, this.chartWidth])
            .padding(0.3);
        const yScale = this.createValueScale(values, [this.chartHeight, 0], 0.15);
        this.renderXAxis(xScale, this.chartHeight, this.categoryLabels());
        this.renderYAxis(yScale);

        const slotCount = comparisonPresentation ? 3 : 1;
        const barWidth = Math.max(0, xScale.bandwidth() / (slotCount + 0.5));
        const baseline = yScale(0);
        const actualValues = dataPoints.map(point => point.actual);

        // The variance chart draws up to two labels per category: the actual value over
        // the actual bar, and the variance over the variance bar. Both are submitted so
        // the reserved footprint matches what is really painted.
        this.planAutoLabels(
            dataPoints.flatMap((point, position) => {
                const xPos = xScale(this.pointKey(point, position)) ?? 0;
                const slots = [{
                    index: position,
                    center: comparisonPresentation
                        ? xPos + barWidth + 2 + barWidth / 2
                        : xPos + xScale.bandwidth() / 2,
                    text: point.actual === null || !this.settings.dataLabels.showValues
                        ? ""
                        : this.formatValue(point.actual)
                }];
                if (comparisonPresentation) {
                    slots.push({
                        index: position,
                        center: xPos + (barWidth + 2) * 2 + barWidth / 2,
                        text: this.getVarianceForPoint(point) === null ? "" : this.formatVarianceLabel(point)
                    });
                }
                return slots;
            }),
            actualValues
        );

        dataPoints.forEach((point, position) => {
            const xPos = xScale(this.pointKey(point, position)) ?? 0;
            const comparison = this.getComparisonForPoint(point);
            const variance = this.getVarianceForPoint(point);
            const sourceIndex = point.index === null ? null : String(point.index);
            const sourceIndices = point.sourceIndices.join(",");

            if (comparisonPresentation && comparison !== null) {
                const comparisonY = yScale(comparison);
                const comparisonBar = this.container.append("rect")
                    .attr("data-dp-index", sourceIndex)
                    .attr("data-source-indices", sourceIndices)
                    .attr("x", xPos)
                    .attr("y", Math.min(comparisonY, baseline))
                    .attr("width", barWidth)
                    .attr("height", Math.abs(baseline - comparisonY));
                if (point.index === null) comparisonBar.attr("class", "aggregate-point");

                if (comparisonPresentation.key === "forecast") {
                    comparisonBar
                        .attr("fill", `url(#${this.forecastPatternId})`)
                        .attr("stroke", comparisonPresentation.color)
                        .attr("stroke-width", 1);
                } else if (comparisonPresentation.key === "previousYear") {
                    comparisonBar.attr("fill", comparisonPresentation.color).attr("opacity", 0.4);
                } else {
                    comparisonBar
                        .attr("fill", "none")
                        .attr("stroke", comparisonPresentation.color)
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "4,2");
                }
            }

            if (point.actual !== null) {
                const actualY = yScale(point.actual);
                const actualX = comparisonPresentation ? xPos + barWidth + 2 : xPos + (xScale.bandwidth() - barWidth) / 2;
                const actualBar = this.container.append("rect")
                    .attr("data-dp-index", sourceIndex)
                    .attr("data-source-indices", sourceIndices)
                    .attr("x", actualX)
                    .attr("y", Math.min(actualY, baseline))
                    .attr("width", barWidth)
                    .attr("height", Math.abs(baseline - actualY))
                    .attr("fill", this.settings.colors.actual);
                if (point.index === null) actualBar.attr("class", "aggregate-point");
            }

            if (variance !== null && comparisonPresentation) {
                const varianceY = yScale(variance);
                const varianceColor = this.getVarianceColorForPoint(point);
                const varianceBar = this.container.append("rect")
                    .attr("data-dp-index", sourceIndex)
                    .attr("data-source-indices", sourceIndices)
                    .attr("x", xPos + (barWidth + 2) * 2)
                    .attr("y", Math.min(varianceY, baseline))
                    .attr("width", barWidth)
                    .attr("height", Math.abs(baseline - varianceY))
                    .attr("fill", this.settings.highContrast && variance < 0
                        ? this.settings.background
                        : varianceColor)
                    .attr("stroke", this.settings.highContrast ? this.settings.foreground : "none")
                    .attr("stroke-dasharray", this.settings.highContrast && variance < 0 ? "2,2" : "5,2");
                if (point.index === null) varianceBar.attr("class", "aggregate-point");
            }

            if (!this.settings.dataLabels.show || !this.shouldShowLabel(position, dataPoints.length, actualValues)) return;
            if (this.settings.dataLabels.showValues && point.actual !== null) {
                const actualY = yScale(point.actual);
                const actualX = comparisonPresentation ? xPos + barWidth + 2 + barWidth / 2 : xPos + xScale.bandwidth() / 2;
                this.container.append("text")
                    .attr("x", actualX)
                    .attr("y", point.actual >= 0 ? actualY - 5 : actualY + this.settings.dataLabels.fontSize + 3)
                    .attr("text-anchor", "middle")
                    .attr("fill", this.settings.colors.actual)
                    .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                    .text(this.formatValue(point.actual));
            }
            const varianceLabel = this.formatVarianceLabel(point);
            if (variance !== null && comparisonPresentation && varianceLabel) {
                const varianceY = yScale(variance);
                this.container.append("text")
                    .attr("x", xPos + (barWidth + 2) * 2 + barWidth / 2)
                    .attr("y", variance >= 0 ? varianceY - 5 : varianceY + this.settings.dataLabels.fontSize + 3)
                    .attr("text-anchor", "middle")
                    .attr("fill", this.getVarianceColorForPoint(point))
                    .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                    .attr("font-weight", "bold")
                    .text(varianceLabel);
            }
        });

        this.renderCommentMarkers(xScale, yScale);
        const legend = [{ label: "Actual", color: this.settings.colors.actual }];
        if (comparisonPresentation) {
            legend.unshift({ label: comparisonPresentation.label, color: comparisonPresentation.color });
            legend.push(
                { label: "+Variance", color: this.settings.colors.positiveVariance },
                { label: "−Variance", color: this.settings.colors.negativeVariance }
            );
        }
        this.renderLegend(legend);
        this.renderCommentBox();
    }
}
