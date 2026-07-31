/**
 * Chart Registry - Factory for creating chart instances
 */
export { 
    BaseChart, 
    ChartSettings, 
    ChartLabels,
    ChartDimensions,
    TitleSettings,
    DataLabelSettings,
    CategorySettings,
    LegendSettings,
    CommentBoxSettings,
    DifferenceHighlightSettings,
    ChartLayout,
    Rect
} from "./baseChart";
export { VarianceChart } from "./varianceChart";
export { WaterfallChart } from "./waterfallChart";
export { ColumnChart } from "./columnChart";
export { LineChart } from "./lineChart";
export { AreaChart } from "./areaChart";
export { ComboChart } from "./comboChart";
export { BarChart } from "./barChart";
export { DotChart } from "./dotChart";
export { LollipopChart } from "./lollipopChart";

import * as d3 from "d3";
import { BaseChart, ChartSettings, ChartDimensions } from "./baseChart";
import { VarianceChart } from "./varianceChart";
import { WaterfallChart } from "./waterfallChart";
import { ColumnChart } from "./columnChart";
import { LineChart } from "./lineChart";
import { AreaChart } from "./areaChart";
import { ComboChart } from "./comboChart";
import { BarChart } from "./barChart";
import { DotChart } from "./dotChart";
import { LollipopChart } from "./lollipopChart";
import {
    ComparisonType,
    finiteStackExtents,
    finiteSum,
    FiniteValue,
    getAvailableComparisonType,
    getComparisonValue,
    getDataPointGroupKey,
    getGroupKeys,
    getVariance,
    ParsedData,
    safeAdd
} from "../dataParser";

export type ChartType = 
    | "variance" 
    | "waterfall" 
    | "column" 
    | "columnStacked" 
    | "bar" 
    | "line" 
    | "area" 
    | "combo" 
    | "dot"
    | "lollipop";

function finiteDomain(values: FiniteValue[]): [number, number] {
    let min = 0;
    let max = 0;
    for (const value of values) {
        if (value !== null && Number.isFinite(value)) {
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
    }
    return min === 0 && max === 0 ? [-1, 1] : [min, max];
}

/**
 * Returns exactly the values a chart can render. The result is unpadded,
 * finite, and includes zero so every small-multiple cell can share it safely.
 */
export function getChartValueDomain(
    chartType: ChartType,
    data: ParsedData,
    preferredComparison: ComparisonType,
    invertVariance: boolean
): [number, number] {
    const comparison = getAvailableComparisonType(data, preferredComparison);
    const values: FiniteValue[] = [];

    if (chartType === "lollipop") {
        for (const point of data.dataPoints) {
            const variance = comparison === null ? null : getVariance(point, comparison);
            values.push(variance === null ? null : invertVariance ? -variance : variance);
        }
        return finiteDomain(values);
    }

    if (chartType === "waterfall") {
        const groups = data.hasGroups ? getGroupKeys(data) : [""];
        let canInvertBridge = comparison !== null;
        for (const group of groups) {
            const points = data.hasGroups
                ? data.dataPoints.filter(point => getDataPointGroupKey(point) === group)
                : data.dataPoints;
            if (comparison === null) {
                canInvertBridge = false;
                values.push(...points.map(point => point.actual));
                continue;
            }
            const pairs = points.filter(point =>
                !point.comment.startsWith("=")
                && point.actual !== null
                && getComparisonValue(point, comparison) !== null
            );
            if (pairs.length === 0) {
                canInvertBridge = false;
                values.push(...points.map(point => point.actual));
                continue;
            }
            const opening = finiteSum(pairs.map(point => getComparisonValue(point, comparison)));
            const closing = finiteSum(pairs.map(point => point.actual));
            if (opening === null || closing === null) {
                canInvertBridge = false;
                values.push(...points.map(point => point.actual));
                continue;
            }
            let running = opening;
            const groupValues: FiniteValue[] = [running];
            let validBridge = true;
            for (const point of points) {
                if (point.comment.startsWith("=")) {
                    groupValues.push(running);
                    continue;
                }
                if (point.actual === null || getComparisonValue(point, comparison) === null) continue;
                const variance = getVariance(point, comparison);
                const next = safeAdd(running, variance);
                if (variance === null || next === null) {
                    validBridge = false;
                    break;
                }
                running = next;
                groupValues.push(running);
            }
            if (validBridge) {
                groupValues.push(closing);
                values.push(...groupValues);
            } else {
                canInvertBridge = false;
                values.push(...points.map(point => point.actual));
            }
        }
        return finiteDomain(
            invertVariance && canInvertBridge
                ? values.map(value => value === null ? null : -value)
                : values
        );
    }

    if (chartType === "columnStacked") {
        for (const point of data.dataPoints) {
            if (comparison === null) {
                values.push(...finiteStackExtents([point.actual]));
            } else {
                values.push(point.actual, getComparisonValue(point, comparison));
            }
        }
        return finiteDomain(values);
    }

    const allComparators = chartType === "line" || chartType === "area" || chartType === "combo";
    for (const point of data.dataPoints) {
        values.push(point.actual);
        if (allComparators) {
            if (data.hasBudget) values.push(point.budget);
            if (data.hasPreviousYear) values.push(point.previousYear);
            if (data.hasForecast) values.push(point.forecast);
        } else if (comparison !== null) {
            values.push(getComparisonValue(point, comparison));
        }
        if (chartType === "variance" && comparison !== null) {
            const variance = getVariance(point, comparison);
            values.push(variance === null ? null : invertVariance ? -variance : variance);
        }
    }
    return finiteDomain(values);
}

export function createChart(
    chartType: ChartType,
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: ParsedData,
    settings: ChartSettings,
    dimensions: ChartDimensions
): BaseChart {
    switch (chartType) {
        case "variance":
            return new VarianceChart(container, data, settings, dimensions);
        
        case "waterfall":
            return new WaterfallChart(container, data, settings, dimensions);
        
        case "column":
            return new ColumnChart(container, data, settings, dimensions, false);
        
        case "columnStacked":
            return new ColumnChart(container, data, settings, dimensions, true);
        
        case "bar":
            return new BarChart(container, data, settings, dimensions);
        
        case "line":
            return new LineChart(container, data, settings, dimensions);
        
        case "area":
            return new AreaChart(container, data, settings, dimensions);
        
        case "combo":
            return new ComboChart(container, data, settings, dimensions);

        case "dot":
            return new DotChart(container, data, settings, dimensions);
        
        case "lollipop":
            return new LollipopChart(container, data, settings, dimensions);
        
        default:
            return new VarianceChart(container, data, settings, dimensions);
    }
}
