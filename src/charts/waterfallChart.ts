/**
 * Waterfall Chart - Bridge analysis from comparison to actual
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData } from "../dataParser";

interface WaterfallItem {
    label: string;
    value: number;
    start: number;
    end: number;
    isTotal: boolean;
    variance?: number;
    variancePct?: number;
}

export class WaterfallChart extends BaseChart {
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

        // Calculate totals based on comparison type
        const totalComparison = dataPoints.reduce((sum, d) => sum + this.getComparisonForPoint(d), 0);
        const totalActual = dataPoints.reduce((sum, d) => sum + d.actual, 0);

        // Build waterfall data
        const waterfallData: WaterfallItem[] = [];
        
        // Starting point (Total Comparison)
        waterfallData.push({
            label: this.getComparisonLabel(),
            value: totalComparison,
            start: 0,
            end: totalComparison,
            isTotal: true
        });

        // Add variance steps (with subtotal detection)
        let runningTotal = totalComparison;
        dataPoints.forEach(d => {
            const isSubtotal = d.comment && d.comment.startsWith("=");
            
            if (isSubtotal) {
                // Subtotal bar shows running total
                waterfallData.push({
                    label: d.category,
                    value: runningTotal,
                    start: 0,
                    end: runningTotal,
                    isTotal: true,
                    variance: 0,
                    variancePct: 0
                });
            } else {
                // Normal variance step
                const variance = this.getVarianceForPoint(d);
                const variancePct = this.getVariancePctForPoint(d);
                const newTotal = runningTotal + variance;
                
                waterfallData.push({
                    label: d.category,
                    value: variance,
                    start: runningTotal,
                    end: newTotal,
                    isTotal: false,
                    variance,
                    variancePct
                });
                runningTotal = newTotal;
            }
        });

        // End point (Total Actual)
        waterfallData.push({
            label: "Actual",
            value: totalActual,
            start: 0,
            end: totalActual,
            isTotal: true
        });

        // Scales
        const maxValue = d3.max(waterfallData, d => Math.max(d.start, d.end)) || 0;
        const minValue = d3.min(waterfallData, d => Math.min(d.start, d.end, 0)) || 0;

        const xScale = d3.scaleBand()
            .domain(waterfallData.map(d => d.label))
            .range([0, this.chartWidth])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            .domain([minValue * 1.1, maxValue * 1.1])
            .range([this.chartHeight, 0]);

        // Render axes
        this.renderXAxis(xScale, this.chartHeight);
        this.renderYAxis(yScale);

        // Zero line
        this.container.append("line")
            .attr("x1", 0)
            .attr("x2", this.chartWidth)
            .attr("y1", yScale(0))
            .attr("y2", yScale(0))
            .attr("stroke", "#999")
            .attr("stroke-dasharray", "3,3");

        // Draw waterfall bars
        waterfallData.forEach((d, i) => {
            const xPos = xScale(d.label) || 0;
            const barWidth = xScale.bandwidth();

            let barColor: string;
            let y: number;
            let barHeight: number;

            if (d.isTotal) {
                barColor = this.settings.colors.actual;
                y = yScale(d.end);
                barHeight = Math.abs(yScale(0) - yScale(d.end));
            } else {
                barColor = d.value >= 0 
                    ? this.settings.colors.positiveVariance 
                    : this.settings.colors.negativeVariance;
                y = yScale(Math.max(d.start, d.end));
                barHeight = Math.abs(yScale(d.start) - yScale(d.end));
            }

            this.container.append("rect")
                .attr("data-dp-index", String(i))
                .attr("x", xPos)
                .attr("y", y)
                .attr("width", barWidth)
                .attr("height", Math.max(0, barHeight))
                .attr("fill", barColor);

            // Connector lines between bars
            if (i < waterfallData.length - 1) {
                const nextItem = waterfallData[i + 1];
                const nextX = xScale(nextItem.label) || 0;
                const connectorY = yScale(d.end);
                
                this.container.append("line")
                    .attr("x1", xPos + barWidth)
                    .attr("x2", nextX)
                    .attr("y1", connectorY)
                    .attr("y2", connectorY)
                    .attr("stroke", "#999")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "2,2");
            }

            // Value labels
            const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
            const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
            const showPercentage = this.settings.dataLabels?.showPercentage ?? this.settings.showPercentage;
            const fontColor = this.settings.categories?.fontColor ?? this.settings.fontColor;
            const wfValues = waterfallData.map(wd => wd.value);

            if (showLabels && this.shouldShowLabel(i, waterfallData.length, wfValues)) {
                let labelText: string;
                if (d.isTotal) {
                    labelText = this.formatValue(d.value);
                } else if (showPercentage && d.variancePct !== undefined) {
                    const sign = d.variancePct >= 0 ? "+" : "";
                    labelText = `${sign}${d.variancePct.toFixed(1)}%`;
                } else {
                    const sign = d.value >= 0 ? "+" : "";
                    labelText = `${sign}${this.formatValue(d.value)}`;
                }

                this.container.append("text")
                    .attr("x", xPos + barWidth / 2)
                    .attr("y", y - 5)
                    .attr("text-anchor", "middle")
                    .attr("fill", d.isTotal ? fontColor : barColor)
                    .attr("font-size", `${fontSize}px`)
                    .attr("font-weight", "bold")
                    .text(labelText);
            }
        });

        // Render legend if enabled
        this.renderLegend([
            { label: this.getComparisonLabel(), color: this.settings.colors.actual },
            { label: "+Variance", color: this.settings.colors.positiveVariance },
            { label: "-Variance", color: this.settings.colors.negativeVariance }
        ]);

        // Render Comment Box
        this.renderCommentBox();
    }

    private getComparisonLabel(): string {
        switch (this.settings.comparisonType) {
            case "previousYear": return "PY Total";
            case "forecast": return "FC Total";
            default: return "Budget";
        }
    }
}
