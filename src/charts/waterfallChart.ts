/**
 * Waterfall Chart - Bridge analysis from comparison to actual
 */
import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { ParsedData, FiniteValue, finiteSum, safeAdd } from "../dataParser";

interface WaterfallItem {
    key: string;
    label: string;
    value: number;
    start: number;
    end: number;
    isTotal: boolean;
    sourceIndex: number | null;
    sourceIndices: number[];
    displayVariance: FiniteValue;
    variancePct: FiniteValue;
    synthetic: boolean;
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
        this.container.attr("transform", `translate(${this.dimensions.margin.left},${this.dimensions.margin.top})`);
        this.renderTitle();
        const waterfallData = this.buildWaterfallData();
        if (waterfallData.length === 0) {
            this.renderLegend([{ label: "Actual", color: this.settings.colors.actual }]);
            return;
        }

        const xScale = d3.scaleBand<string>()
            .domain(waterfallData.map(item => item.key))
            .range([0, this.chartWidth])
            .padding(0.2);
        const labels = new Map(waterfallData.map(item => [item.key, item.label]));
        const yScale = this.createValueScale(
            waterfallData.flatMap(item => [item.start, item.end]),
            [this.chartHeight, 0],
            0.1
        );
        this.renderXAxis(xScale, this.chartHeight, labels);
        this.renderYAxis(yScale);

        const zeroY = yScale(0);
        this.container.append("line")
            .attr("x1", 0).attr("x2", this.chartWidth)
            .attr("y1", zeroY).attr("y2", zeroY)
            .attr("stroke", this.settings.foreground).attr("stroke-dasharray", "3,3");

        const showLabels = this.settings.dataLabels?.show ?? this.settings.showVarianceLabels;
        const fontSize = this.settings.dataLabels?.fontSize ?? this.settings.fontSize;
        const values = waterfallData.map(item => item.value);
        waterfallData.forEach((item, position) => {
            const xPos = xScale(item.key) ?? 0;
            const top = item.isTotal ? Math.max(0, item.end) : Math.max(item.start, item.end);
            const bottom = item.isTotal ? Math.min(0, item.end) : Math.min(item.start, item.end);
            const color = item.isTotal
                ? this.settings.colors.actual
                : item.displayVariance === null || item.displayVariance === 0
                    ? this.settings.colors.actual
                    : item.displayVariance > 0
                        ? this.settings.colors.positiveVariance
                        : this.settings.colors.negativeVariance;
            const topY = yScale(top);
            const bottomY = yScale(bottom);
            if (item.synthetic) {
                const right = xPos + xScale.bandwidth();
                this.container.append("path")
                    .attr("class", "waterfall-total synthetic-total")
                    .attr("d", `M${xPos},${topY} H${right} V${bottomY} H${xPos} Z`)
                    .attr(
                        "fill",
                        this.settings.highContrast && item.displayVariance !== null
                            && item.displayVariance < 0
                            ? this.settings.background
                            : color
                    )
                    .attr("aria-label", `${item.label} total`);
            } else {
                this.container.append("rect")
                    .attr("class", item.isTotal ? "waterfall-total" : "waterfall-step")
                    .attr("data-dp-index", item.sourceIndex === null ? null : String(item.sourceIndex))
                    .attr("data-source-indices", item.sourceIndices.join(","))
                    .attr("x", xPos)
                    .attr("y", topY)
                    .attr("width", xScale.bandwidth())
                    .attr("height", Math.abs(bottomY - topY))
                    .attr(
                        "fill",
                        this.settings.highContrast && item.displayVariance !== null
                            && item.displayVariance < 0
                            ? this.settings.background
                            : color
                    )
                    .attr("stroke", this.settings.highContrast ? this.settings.foreground : "none")
                    .attr("stroke-dasharray", this.settings.highContrast && !item.isTotal
                        ? item.displayVariance !== null && item.displayVariance < 0 ? "2,2" : "5,2"
                        : null);
            }

            if (position < waterfallData.length - 1) {
                const nextX = xScale(waterfallData[position + 1].key) ?? 0;
                const connectorY = yScale(item.end);
                this.container.append("line")
                    .attr("x1", xPos + xScale.bandwidth()).attr("x2", nextX)
                    .attr("y1", connectorY).attr("y2", connectorY)
                    .attr("stroke", this.settings.foreground).attr("stroke-width", 1)
                    .attr("stroke-dasharray", "2,2");
            }

            if (showLabels && this.shouldShowLabel(position, waterfallData.length, values)) {
                let labelText = "";
                if (item.isTotal) {
                    if (this.settings.dataLabels.showValues) {
                        labelText = this.formatValue(item.value);
                    }
                } else {
                    labelText = this.formatVarianceValues(item.displayVariance, item.variancePct);
                }
                if (labelText) {
                    this.container.append("text")
                        .attr("x", xPos + xScale.bandwidth() / 2)
                        .attr("y", yScale(top) - 5)
                        .attr("text-anchor", "middle")
                        .attr("fill", item.isTotal ? this.settings.categories.fontColor : color)
                        .attr("font-size", `${fontSize}px`)
                        .attr("font-weight", "bold")
                        .text(labelText);
                }
            }
        });

        const comparison = this.getComparisonPresentation();
        const legend = [{ label: "Actual", color: this.settings.colors.actual }];
        if (comparison) {
            legend.unshift({ label: comparison.label, color: comparison.color });
            legend.push(
                { label: "+Variance", color: this.settings.colors.positiveVariance },
                { label: "−Variance", color: this.settings.colors.negativeVariance }
            );
        }
        this.renderLegend(legend);
        this.renderCommentBox();
    }

    private buildWaterfallData(): WaterfallItem[] {
        const comparisonType = this.getComparisonType();
        const pairedPoints = comparisonType === null
            ? []
            : this.data.dataPoints.filter(point =>
                !point.comment.startsWith("=")
                && point.actual !== null
                && point[comparisonType] !== null
            );
        const totalActual = finiteSum(pairedPoints.map(point => point.actual));
        const totalComparison = comparisonType === null
            ? null
            : finiteSum(pairedPoints.map(point => point[comparisonType]));
        if (
            comparisonType === null
            || pairedPoints.length === 0
            || totalComparison === null
            || totalActual === null
        ) {
            return this.buildActualOnlyData();
        }

        let validationTotal = totalComparison;
        for (const point of this.data.dataPoints) {
            if (point.comment.startsWith("=") || point.actual === null || point[comparisonType] === null) continue;
            const rawVariance = comparisonType === "budget"
                ? point.varianceToBudget
                : comparisonType === "previousYear"
                    ? point.varianceToPY
                    : point.varianceToFC;
            const next = safeAdd(validationTotal, rawVariance);
            if (next === null) return this.buildActualOnlyData();
            validationTotal = next;
        }

        const comparisonLabel = this.getComparisonPresentation()?.label ?? "Comparison";
        const items: WaterfallItem[] = [{
            key: `${this.instanceId}-opening`,
            label: `${comparisonLabel} Total`,
            value: totalComparison,
            start: 0,
            end: totalComparison,
            isTotal: true,
            sourceIndex: null,
            sourceIndices: [],
            displayVariance: null,
            variancePct: null,
            synthetic: true
        }];
        let runningTotal = totalComparison;

        this.data.dataPoints.forEach((point, position) => {
            const isSubtotal = point.comment.startsWith("=");
            if (isSubtotal) {
                items.push({
                    key: `subtotal-${point.index ?? position}`,
                    label: point.category,
                    value: runningTotal,
                    start: 0,
                    end: runningTotal,
                    isTotal: true,
                    sourceIndex: point.index,
                    sourceIndices: point.sourceIndices,
                    displayVariance: 0,
                    variancePct: null,
                    synthetic: false
                });
                return;
            }
            if (point.actual === null || point[comparisonType] === null) return;
            const rawVariance = comparisonType === "budget"
                ? point.varianceToBudget
                : comparisonType === "previousYear"
                    ? point.varianceToPY
                    : point.varianceToFC;
            const rawPct = comparisonType === "budget"
                ? point.varianceToBudgetPct
                : comparisonType === "previousYear"
                    ? point.varianceToPYPct
                    : point.varianceToFCPct;
            const next = safeAdd(runningTotal, rawVariance);
            if (rawVariance === null || next === null) return;
            const displayVariance = this.settings.invertVariance ? -rawVariance : rawVariance;
            const variancePct = rawPct === null ? null : (this.settings.invertVariance ? -rawPct : rawPct);
            items.push({
                key: `step-${point.index ?? position}`,
                label: point.category,
                value: rawVariance,
                start: runningTotal,
                end: next,
                isTotal: false,
                sourceIndex: point.index,
                sourceIndices: point.sourceIndices,
                displayVariance,
                variancePct,
                synthetic: false
            });
            runningTotal = next;
        });

        items.push({
            key: `${this.instanceId}-closing`,
            label: "Actual",
            value: totalActual,
            start: 0,
            end: totalActual,
            isTotal: true,
            sourceIndex: null,
            sourceIndices: [],
            displayVariance: null,
            variancePct: null,
            synthetic: true
        });
        return items;
    }

    private buildActualOnlyData(): WaterfallItem[] {
        return this.data.dataPoints.flatMap((point, position) => {
            if (point.actual === null) return [];
            return [{
                key: `actual-row-${point.index ?? position}`,
                label: point.category,
                value: point.actual,
                start: 0,
                end: point.actual,
                isTotal: true,
                sourceIndex: point.index,
                sourceIndices: point.sourceIndices,
                displayVariance: null,
                variancePct: null,
                synthetic: false
            }];
        });
    }
}
