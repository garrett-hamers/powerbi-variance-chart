/**
 * Bar Chart - Horizontal grouped bars
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue, MeasureKey } from "../dataParser";

interface Series {
    key: MeasureKey;
    color: string;
    label: string;
}

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
        const { dataPoints } = this.data;
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();

        const series: Series[] = [{
            key: "actual",
            color: this.settings.colors.actual,
            label: this.getChartLabel("actual", "Actual")
        }];
        const comparison = this.getComparisonPresentation();
        if (comparison) series.push(comparison);
        const values: FiniteValue[] = dataPoints.flatMap(point => series.map(item => point[item.key]));
        const keys = this.categoryKeys();
        const labels = this.categoryLabels();
        const yScale = d3.scaleBand<string>().domain(keys).range([0, this.chartHeight]).padding(0.2);
        const xScale = this.createValueScale(values, [0, this.chartWidth]);

        const fontSize = this.settings.categories?.fontSize ?? this.settings.fontSize;
        const fontColor = this.settings.categories?.fontColor ?? this.settings.fontColor;
        this.renderCategoryYAxis(yScale, labels);
        const xAxis = this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${this.chartHeight})`)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(value => this.formatValue(value as number)));
        xAxis.selectAll(".domain, line").attr("stroke", this.settings.foreground);
        xAxis.selectAll("text")
            .style("font-size", `${fontSize}px`)
            .style("fill", fontColor);
        if (this.settings.axisBreak.show) {
            this.renderHorizontalAxisBreak(xScale, this.settings.axisBreak.breakValue);
        }
        this.renderHorizontalReferenceLine(xScale);

        const showLabels = (this.settings.dataLabels?.show ?? false)
            && this.settings.dataLabels.showValues;
        const labelFontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const barHeight = Math.max(0, yScale.bandwidth() / Math.max(1, series.length));
        const actualValues = dataPoints.map(point => point.actual);
        const baseline = xScale(0);

        // Horizontal bars stack their labels down the category axis, so labels collide
        // vertically: the extent is line height. Each series gets its own row inside the
        // band, so submit one slot per series to reserve the full stack.
        this.planAutoLabels(
            dataPoints.flatMap((point, pointPosition) => {
                const yPos = yScale(this.pointKey(point, pointPosition)) ?? 0;
                return series.map((item, seriesPosition) => ({
                    index: pointPosition,
                    center: yPos + seriesPosition * barHeight + barHeight / 2,
                    text: point[item.key] === null ? "" : this.formatValue(point[item.key], item.key)
                }));
            }),
            actualValues,
            "vertical"
        );

        dataPoints.forEach((point, pointPosition) => {
            const yPos = yScale(this.pointKey(point, pointPosition)) ?? 0;
            series.forEach((item, seriesPosition) => {
                const value = point[item.key];
                if (value === null) return;
                const valueX = xScale(value);
                const rect = this.container.append("rect")
                    .attr("data-dp-index", point.index === null ? null : String(point.index))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("x", Math.min(valueX, baseline))
                    .attr("y", yPos + seriesPosition * barHeight)
                    .attr("width", Math.abs(valueX - baseline))
                    .attr("height", Math.max(0, barHeight - 2))
                    .attr("fill", this.settings.highContrast && item.key !== "actual"
                        ? this.settings.background
                        : item.color)
                    .attr("stroke", this.settings.highContrast ? this.settings.foreground : "none")
                    .attr("stroke-dasharray", this.settings.highContrast && item.key !== "actual" ? "4,2" : null);
                if (point.index === null) rect.attr("class", "aggregate-point");

                if (showLabels && this.shouldShowLabel(pointPosition, dataPoints.length, actualValues)) {
                    this.container.append("text")
                        .attr("x", value >= 0 ? valueX + 5 : valueX - 5)
                        .attr("y", yPos + seriesPosition * barHeight + barHeight / 2 + 4)
                        .attr("text-anchor", value >= 0 ? "start" : "end")
                        .attr("fill", item.color)
                        .attr("font-size", `${labelFontSize}px`)
                        .text(this.formatValue(value, item.key));
                }
            });
        });

        this.renderHorizontalCommentMarkers(xScale, yScale);
        this.renderLegend(series.map(item => ({ label: item.label, color: item.color })));
        this.renderCommentBox();
    }
}
