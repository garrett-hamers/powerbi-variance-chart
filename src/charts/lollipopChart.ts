/**
 * Lollipop Chart - Variance visualization with dots and stems
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

export class LollipopChart extends BaseChart {
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
        const comparison = this.getComparisonPresentation();
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();

        const variances = dataPoints.map(point => this.getVarianceForPoint(point));
        const yScale = d3.scaleBand<string>().domain(this.categoryKeys()).range([0, this.chartHeight]).padding(0.3);
        const xScale = this.createValueScale(variances, [0, this.chartWidth], 0.2);
        const fontSize = this.settings.categories?.fontSize ?? this.settings.fontSize;
        const fontColor = this.settings.categories?.fontColor ?? this.settings.fontColor;
        const xAxis = this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${this.chartHeight})`)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(value => this.formatValue(value as number)));
        xAxis.selectAll(".domain, line").attr("stroke", this.settings.foreground);
        xAxis.selectAll("text").style("font-size", `${fontSize}px`).style("fill", fontColor);
        if (this.settings.axisBreak.show) {
            this.renderHorizontalAxisBreak(xScale, this.settings.axisBreak.breakValue);
        }
        if (this.settings.categories.show) {
            const yAxis = this.container.append("g")
                .attr("class", "y-axis")
                .call(d3.axisLeft(yScale).tickFormat(key => this.categoryLabels().get(String(key)) ?? String(key)));
            yAxis.selectAll(".domain, line").attr("stroke", this.settings.foreground);
            yAxis.selectAll("text").style("font-size", `${fontSize}px`).style("fill", fontColor);
        }
        this.container.append("line")
            .attr("x1", xScale(0)).attr("x2", xScale(0))
            .attr("y1", 0).attr("y2", this.chartHeight)
            .attr("stroke", this.settings.foreground).attr("stroke-width", 1);

        if (!comparison) {
            this.container.append("text")
                .attr("class", "no-comparison")
                .attr("x", this.chartWidth / 2)
                .attr("y", this.chartHeight / 2)
                .attr("text-anchor", "middle")
                .attr("fill", fontColor)
                .text("No comparison available");
            this.renderCommentBox();
            return;
        }

        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const labelFontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        // Horizontal lollipops: labels collide vertically down the category axis.
        this.planAutoLabels(
            dataPoints.map((point, position) => ({
                index: position,
                center: (yScale(this.pointKey(point, position)) ?? 0) + yScale.bandwidth() / 2,
                text: this.formatVarianceLabel(point)
            })),
            variances,
            "vertical"
        );

        dataPoints.forEach((point, position) => {
            const variance = this.getVarianceForPoint(point);
            if (variance === null) return;
            const yPos = (yScale(this.pointKey(point, position)) ?? 0) + yScale.bandwidth() / 2;
            const xEnd = xScale(variance);
            const xStart = xScale(0);
            const color = this.getVarianceColorForPoint(point);
            const negative = variance < 0;
            this.container.append("line")
                .attr("x1", xStart).attr("x2", xEnd)
                .attr("y1", yPos).attr("y2", yPos)
                .attr("stroke", color).attr("stroke-width", 2)
                .attr("stroke-dasharray", this.settings.highContrast && negative ? "2,2" : null);
            this.container.append("circle")
                .attr("data-dp-index", point.index === null ? null : String(point.index))
                .attr("data-source-indices", point.sourceIndices.join(","))
                .attr("cx", xEnd).attr("cy", yPos).attr("r", 6)
                .attr("fill", this.settings.highContrast && negative ? this.settings.background : color)
                .attr("stroke", color)
                .attr("stroke-width", 2);
            const varianceLabel = this.formatVarianceLabel(point);
            if (showLabels && varianceLabel && this.shouldShowLabel(position, dataPoints.length, variances)) {
                this.container.append("text")
                    .attr("x", variance >= 0 ? xEnd + 10 : xEnd - 10)
                    .attr("y", yPos + 4)
                    .attr("text-anchor", variance >= 0 ? "start" : "end")
                    .attr("fill", color).attr("font-size", `${labelFontSize}px`)
                    .attr("font-weight", "bold").text(varianceLabel);
            }
        });

        this.renderLegend([
            { label: "+Variance", color: this.settings.colors.positiveVariance },
            { label: "−Variance", color: this.settings.colors.negativeVariance }
        ]);
        this.renderCommentBox();
    }
}
