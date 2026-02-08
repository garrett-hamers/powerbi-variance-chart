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
        const margin = this.dimensions.margin;

        this.container.attr("transform", `translate(${margin.left},${margin.top})`);

        // Render title if enabled
        this.renderTitle();

        // Calculate max variance for scale
        const maxVariance = d3.max(dataPoints, d => Math.abs(this.getVarianceForPoint(d))) || 0;

        // Scales - horizontal lollipop
        const yScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, this.chartHeight])
            .padding(0.3);

        const xScale = d3.scaleLinear()
            .domain([-maxVariance * 1.2, maxVariance * 1.2])
            .range([0, this.chartWidth]);

        const fontSize = this.settings.categories?.fontSize ?? this.settings.fontSize;
        const fontColor = this.settings.categories?.fontColor ?? this.settings.fontColor;

        // X Axis
        const xAxis = d3.axisBottom(xScale)
            .ticks(6)
            .tickFormat(d => this.formatValue(d as number));

        this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${this.chartHeight})`)
            .call(xAxis)
            .selectAll("text")
            .style("font-size", `${fontSize}px`)
            .style("fill", fontColor);

        // Y Axis
        const yAxis = d3.axisLeft(yScale);
        
        this.container.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("font-size", `${fontSize}px`)
            .style("fill", fontColor);

        // Zero line
        this.container.append("line")
            .attr("x1", xScale(0))
            .attr("x2", xScale(0))
            .attr("y1", 0)
            .attr("y2", this.chartHeight)
            .attr("stroke", "#666")
            .attr("stroke-width", 1);

        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const labelFontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;

        const lollipopValues = dataPoints.map(d => this.getVarianceForPoint(d));

        // Render lollipops
        dataPoints.forEach((d, i) => {
            const yPos = (yScale(d.category) || 0) + yScale.bandwidth() / 2;
            const variance = this.getVarianceForPoint(d);
            const xEnd = xScale(variance);
            const xStart = xScale(0);
            const color = this.getVarianceColorForPoint(d);

            // Stem (line)
            this.container.append("line")
                .attr("x1", xStart)
                .attr("x2", xEnd)
                .attr("y1", yPos)
                .attr("y2", yPos)
                .attr("stroke", color)
                .attr("stroke-width", 2);

            // Dot
            this.container.append("circle")
                .attr("data-dp-index", String(i))
                .attr("cx", xEnd)
                .attr("cy", yPos)
                .attr("r", 6)
                .attr("fill", color);

            // Label
            if (showLabels && this.shouldShowLabel(i, dataPoints.length, lollipopValues)) {
                const labelText = this.formatVarianceLabel(d);
                const labelX = variance >= 0 ? xEnd + 10 : xEnd - 10;
                const anchor = variance >= 0 ? "start" : "end";

                this.container.append("text")
                    .attr("x", labelX)
                    .attr("y", yPos + 4)
                    .attr("text-anchor", anchor)
                    .attr("fill", color)
                    .attr("font-size", `${labelFontSize}px`)
                    .attr("font-weight", "bold")
                    .text(labelText);
            }
        });

        // Legend
        this.renderLegend([
            { label: "+Variance", color: this.settings.colors.positiveVariance },
            { label: "-Variance", color: this.settings.colors.negativeVariance }
        ]);

        // Render Comment Box
        this.renderCommentBox();
    }
}
