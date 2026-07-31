/**
 * Column Chart - Standard and stacked column charts
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, DataPoint, FiniteValue, MeasureKey, finiteStackExtents, safeAdd } from "../dataParser";

interface Series {
    key: MeasureKey;
    color: string;
    label: string;
}

export class ColumnChart extends BaseChart {
    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: ChartSettings,
        dimensions: ChartDimensions,
        private readonly stacked: boolean = false
    ) {
        super(container, data, settings, dimensions);
    }

    render(): void {
        if (this.chartWidth <= 0 || this.chartHeight <= 0) return;
        const { dataPoints } = this.data;
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();

        const series: Series[] = [
            { key: "actual", color: this.settings.colors.actual, label: this.getChartLabel("actual", "Actual") }
        ];
        const comparison = this.getComparisonPresentation();
        if (comparison) series.push(comparison);

        const extentValues: FiniteValue[] = [];
        if (this.stacked) {
            for (const point of dataPoints) {
                const values = series.map(item => point[item.key]);
                extentValues.push(...finiteStackExtents(values));
            }
        } else {
            for (const point of dataPoints) {
                extentValues.push(...series.map(item => point[item.key]));
            }
        }

        const keys = this.categoryKeys();
        const xScale = d3.scaleBand<string>().domain(keys).range([0, this.chartWidth]).padding(0.2);
        const yScale = this.createValueScale(extentValues, [this.chartHeight, 0]);

        this.renderXAxis(xScale, this.chartHeight, this.categoryLabels());
        this.renderYAxis(yScale);
        if (this.stacked && !comparison) {
            this.renderStacked(dataPoints, series, xScale, yScale);
        } else {
            // Scenario measures are alternatives, not additive components. Keep
            // them grouped instead of implying that Actual + Plan is a total.
            this.renderGrouped(dataPoints, series, xScale, yScale);
        }
        this.renderCommentMarkers(xScale, yScale);
        this.renderLegend(series.map(item => ({ label: item.label, color: item.color })));
        this.renderCommentBox();
    }

    private renderGrouped(
        dataPoints: DataPoint[],
        series: Series[],
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const barWidth = Math.max(0, xScale.bandwidth() / Math.max(1, series.length));
        const showLabels = (this.settings.dataLabels?.show ?? this.settings.showVarianceLabels)
            && this.settings.dataLabels.showValues;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const allValues = dataPoints.map(point => point.actual);
        const baseline = yScale(0);

        // One slot per drawn label: grouped columns label every series at its own
        // offset inside the band, so the category's real footprint spans them all.
        this.planAutoLabels(
            dataPoints.flatMap((point, pointPosition) => {
                const xPos = xScale(this.pointKey(point, pointPosition)) ?? 0;
                return series.map((item, seriesPosition) => ({
                    index: pointPosition,
                    center: xPos + seriesPosition * barWidth + Math.max(0, barWidth - 2) / 2,
                    text: point[item.key] === null ? "" : this.formatValue(point[item.key], item.key)
                }));
            }),
            allValues
        );

        dataPoints.forEach((point, pointPosition) => {
            const xPos = xScale(this.pointKey(point, pointPosition)) ?? 0;
            series.forEach((item, seriesPosition) => {
                const value = point[item.key];
                if (value === null) return;
                const valueY = yScale(value);
                const rect = this.container.append("rect")
                    .attr("data-dp-index", point.index === null ? null : String(point.index))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("x", xPos + seriesPosition * barWidth)
                    .attr("y", Math.min(valueY, baseline))
                    .attr("width", Math.max(0, barWidth - 2))
                    .attr("height", Math.abs(baseline - valueY))
                    .attr("fill", this.settings.highContrast && item.key !== "actual"
                        ? this.settings.background
                        : item.color)
                    .attr("stroke", this.settings.highContrast ? this.settings.foreground : "none")
                    .attr("stroke-dasharray", this.settings.highContrast && item.key !== "actual" ? "4,2" : null);
                if (point.index === null) rect.attr("class", "aggregate-point");

                if (showLabels && this.shouldShowLabel(pointPosition, dataPoints.length, allValues)) {
                    this.container.append("text")
                        .attr("x", xPos + seriesPosition * barWidth + Math.max(0, barWidth - 2) / 2)
                        .attr("y", value >= 0 ? valueY - 5 : valueY + fontSize + 3)
                        .attr("text-anchor", "middle")
                        .attr("fill", item.color)
                        .attr("font-size", `${fontSize}px`)
                        .text(this.formatValue(value, item.key));
                }
            });
        });
    }

    private renderStacked(
        dataPoints: DataPoint[],
        series: Series[],
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>
    ): void {
        const barWidth = xScale.bandwidth();
        const showLabels = (this.settings.dataLabels?.show ?? this.settings.showVarianceLabels)
            && this.settings.dataLabels.showValues;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const allValues = dataPoints.map(point => point.actual);

        // Stacked columns carry a single total label per category.
        this.planAutoLabels(
            dataPoints.map((point, pointPosition) => {
                const total = series.reduce((sum, item) => sum + (point[item.key] ?? 0), 0);
                return {
                    index: pointPosition,
                    center: (xScale(this.pointKey(point, pointPosition)) ?? 0) + barWidth / 2,
                    text: this.formatValue(total)
                };
            }),
            allValues
        );

        dataPoints.forEach((point, pointPosition) => {
            const xPos = xScale(this.pointKey(point, pointPosition)) ?? 0;
            let positiveBase = 0;
            let negativeBase = 0;
            series.forEach(item => {
                const value = point[item.key];
                if (value === null) return;
                const start = value >= 0 ? positiveBase : negativeBase;
                const end = safeAdd(start, value);
                if (end === null) return;
                if (value >= 0) positiveBase = end;
                else negativeBase = end;

                const rect = this.container.append("rect")
                    .attr("data-dp-index", point.index === null ? null : String(point.index))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("x", xPos)
                    .attr("y", Math.min(yScale(start), yScale(end)))
                    .attr("width", barWidth)
                    .attr("height", Math.abs(yScale(start) - yScale(end)))
                    .attr("fill", this.settings.highContrast && item.key !== "actual"
                        ? this.settings.background
                        : item.color)
                    .attr("stroke", this.settings.highContrast ? this.settings.foreground : "none")
                    .attr("stroke-dasharray", this.settings.highContrast && item.key !== "actual" ? "4,2" : null);
                if (point.index === null) rect.attr("class", "aggregate-point");
            });

            if (showLabels && this.shouldShowLabel(pointPosition, dataPoints.length, allValues)) {
                const total = positiveBase + negativeBase;
                const labelExtent = total >= 0 ? positiveBase : negativeBase;
                this.container.append("text")
                    .attr("x", xPos + barWidth / 2)
                    .attr("y", total >= 0 ? yScale(labelExtent) - 5 : yScale(labelExtent) + fontSize + 3)
                    .attr("text-anchor", "middle")
                    .attr("fill", this.settings.colors.actual)
                    .attr("font-size", `${fontSize}px`)
                    .text(this.formatValue(total));
            }
        });
    }
}
