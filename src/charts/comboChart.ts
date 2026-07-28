/**
 * Combo Chart - Columns for actuals + lines for comparison series
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue, ComparisonType } from "../dataParser";

interface LineSeries {
    key: ComparisonType;
    color: string;
    label: string;
    dashed: boolean;
}

interface LinePoint {
    key: string;
    value: FiniteValue;
    sourceIndex: number | null;
    sourceIndices: number[];
}

export class ComboChart extends BaseChart {
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

        const lineSeries: LineSeries[] = [];
        if (this.data.hasBudget) lineSeries.push({ key: "budget", color: this.settings.colors.budget, label: "Plan", dashed: true });
        if (this.data.hasPreviousYear) lineSeries.push({ key: "previousYear", color: this.settings.colors.previousYear, label: "Previous Year", dashed: false });
        if (this.data.hasForecast) lineSeries.push({ key: "forecast", color: this.settings.colors.forecast, label: "Forecast", dashed: true });

        const xScale = d3.scaleBand<string>()
            .domain(this.categoryKeys())
            .range([0, this.chartWidth])
            .padding(0.2);
        const values: FiniteValue[] = dataPoints.flatMap(point => [
            point.actual,
            ...lineSeries.map(item => point[item.key])
        ]);
        const yScale = this.createValueScale(values, [this.chartHeight, 0]);
        this.renderXAxis(xScale, this.chartHeight, this.categoryLabels());
        this.renderYAxis(yScale);

        const showLabels = (this.settings.dataLabels?.show ?? false)
            && this.settings.dataLabels.showValues;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const actualValues = dataPoints.map(point => point.actual);
        const baseline = yScale(0);

        this.planAutoLabels(
            dataPoints.map((point, position) => ({
                index: position,
                center: (xScale(this.pointKey(point, position)) ?? 0) + xScale.bandwidth() / 2,
                text: point.actual === null ? "" : this.formatValue(point.actual)
            })),
            actualValues
        );

        dataPoints.forEach((point, position) => {
            if (point.actual === null) return;
            const xPos = xScale(this.pointKey(point, position)) ?? 0;
            const valueY = yScale(point.actual);
            const rect = this.container.append("rect")
                .attr("data-dp-index", point.index === null ? null : String(point.index))
                .attr("data-source-indices", point.sourceIndices.join(","))
                .attr("x", xPos)
                .attr("y", Math.min(valueY, baseline))
                .attr("width", xScale.bandwidth())
                .attr("height", Math.abs(baseline - valueY))
                .attr("fill", this.settings.colors.actual);
            if (point.index === null) rect.attr("class", "aggregate-point");
            if (showLabels && this.shouldShowLabel(position, dataPoints.length, actualValues)) {
                this.container.append("text")
                    .attr("x", xPos + xScale.bandwidth() / 2)
                    .attr("y", point.actual >= 0 ? valueY - 5 : valueY + fontSize + 3)
                    .attr("text-anchor", "middle")
                    .attr("fill", this.settings.colors.actual)
                    .attr("font-size", `${fontSize}px`)
                    .text(this.formatValue(point.actual));
            }
        });

        lineSeries.forEach(item => {
            const lineData: LinePoint[] = dataPoints.map((point, position) => ({
                key: this.pointKey(point, position),
                value: point[item.key],
                sourceIndex: point.index,
                sourceIndices: point.sourceIndices
            }));
            const line = d3.line<LinePoint>()
                .defined(point => point.value !== null)
                .x(point => (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                .y(point => yScale(point.value as number));
            const path = line(lineData);
            if (path) {
                this.container.append("path")
                    .attr("fill", "none")
                    .attr("stroke", item.color)
                    .attr("stroke-width", 2.5)
                    .attr("stroke-dasharray", this.settings.highContrast
                        ? item.key === "budget" ? "6,3"
                            : item.key === "previousYear" ? "2,2" : "8,2,2,2"
                        : item.dashed ? "6,3" : "none")
                    .attr("d", path);
            }
            lineData.forEach(point => {
                if (point.value === null) return;
                const circle = this.container.append("circle")
                    .attr("data-dp-index", point.sourceIndex === null ? null : String(point.sourceIndex))
                    .attr("data-source-indices", point.sourceIndices.join(","))
                    .attr("cx", (xScale(point.key) ?? 0) + xScale.bandwidth() / 2)
                    .attr("cy", yScale(point.value))
                    .attr("r", 4)
                    .attr("fill", this.settings.highContrast ? this.settings.background : item.color)
                    .attr("stroke", item.color)
                    .attr("stroke-width", 1.5);
                if (point.sourceIndex === null) circle.attr("class", "aggregate-point");
            });
        });

        this.renderCommentMarkers(xScale, yScale);
        this.renderLegend([
            { label: "Actual", color: this.settings.colors.actual },
            ...lineSeries.map(item => ({ label: item.label, color: item.color }))
        ]);
        this.renderCommentBox();
    }
}
