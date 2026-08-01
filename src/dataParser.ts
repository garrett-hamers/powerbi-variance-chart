/**
 * Data Parser - Handles data transformation and automatic variance calculations
 */
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;
import { formatModelValue, formatPrimitiveValue } from "./utils/formatting";

export type FiniteValue = number | null;
export type ComparisonType = "budget" | "previousYear" | "forecast";
export type MeasureKey = "actual" | ComparisonType;
export type VarianceStateKind = "valid" | "zeroReference" | "missing" | "nonFinite";
export type VarianceAggregation = "additive" | "nonAdditive";
export type VarianceDirection = "higherIsBetter" | "lowerIsBetter" | "neutral";
export type VarianceOutcome = "favorable" | "unfavorable" | "neutral" | "unknown";

export interface VarianceSemantics {
    aggregation: VarianceAggregation;
    direction: VarianceDirection;
}

export interface SemanticVariance {
    kind: VarianceStateKind;
    aggregation: VarianceAggregation;
    direction: VarianceDirection;
    outcome: VarianceOutcome;
    actual: FiniteValue;
    reference: FiniteValue;
    variance: FiniteValue;
    percentage: FiniteValue;
}

export interface DataCompleteness {
    state: "complete" | "partial";
    reason?: "hostDataReduction";
}

export interface TopNState {
    applied: boolean;
    completeness: DataCompleteness["state"];
    others: "notRequested" | "notNeeded" | "complete" | "omittedPartial" | "omittedNonAdditive";
}

export interface TooltipField {
    displayName: string;
    value: string;
    format?: string;
}

export interface DataPoint {
    category: string;
    group: string;
    /** Raw model values used for identity/filtering; labels above are formatted for display. */
    categoryValue?: PrimitiveValue;
    groupValue?: PrimitiveValue;
    /** Stable identity derived from the raw group value, independent of display formatting. */
    groupKey?: string;
    categoryFormat?: string;
    groupFormat?: string;
    actual: FiniteValue;
    budget: FiniteValue;
    previousYear: FiniteValue;
    forecast: FiniteValue;
    comment: string;
    varianceToBudget: FiniteValue;
    varianceToBudgetPct: FiniteValue;
    varianceToPY: FiniteValue;
    varianceToPYPct: FiniteValue;
    varianceToFC: FiniteValue;
    varianceToFCPct: FiniteValue;
    varianceStates?: Partial<Record<ComparisonType, SemanticVariance>>;
    tooltipFields?: TooltipField[];
    /** True when Power BI supplied a non-null highlight value for this row. */
    highlighted?: boolean;
    /** Original categorical row. Aggregates and synthetic points do not have one. */
    index: number | null;
    /** Original rows represented by this point (one for normal points, many for Others). */
    sourceIndices: number[];
    /** True only for a synthetic aggregate such as Top N's Others row. */
    isSynthetic?: boolean;
}

export interface MeasureFormats {
    actual?: string;
    budget?: string;
    previousYear?: string;
    forecast?: string;
}

export interface ParsedData {
    dataPoints: DataPoint[];
    groups: string[];
    /** Stable raw-value keys corresponding to groups, in display order. */
    groupKeys?: string[];
    hasActual: boolean;
    hasBudget: boolean;
    hasPreviousYear: boolean;
    hasForecast: boolean;
    hasGroups: boolean;
    hasComments: boolean;
    /** True when the host supplied an active, non-null highlights array. */
    hasHighlights?: boolean;
    totals: {
        actual: FiniteValue;
        budget: FiniteValue;
        previousYear: FiniteValue;
        forecast: FiniteValue;
    };
    maxValue: number;
    minValue: number;
    formats: MeasureFormats;
    locale?: string;
    completeness?: DataCompleteness;
    topNState?: TopNState;
}

interface ValueColumnInfo {
    values: PrimitiveValue[];
    highlights?: PrimitiveValue[];
    format?: string;
}

interface TooltipColumnInfo extends ValueColumnInfo {
    displayName: string;
}

export function toFiniteNumber(value: unknown): FiniteValue {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
}

export function safeAdd(a: FiniteValue, b: FiniteValue): FiniteValue {
    if (a === null || b === null) return null;
    return toFiniteNumber(a + b);
}

export function safeSubtract(a: FiniteValue, b: FiniteValue): FiniteValue {
    if (a === null || b === null) return null;
    return toFiniteNumber(a - b);
}

export function calculatePercentage(variance: FiniteValue, base: FiniteValue): FiniteValue {
    if (variance === null || base === null || base === 0) return null;
    return toFiniteNumber((variance / Math.abs(base)) * 100);
}

const DEFAULT_VARIANCE_SEMANTICS: VarianceSemantics = {
    aggregation: "additive",
    direction: "higherIsBetter"
};

function inputState(value: unknown): "valid" | "missing" | "nonFinite" {
    if (value === null || value === undefined || typeof value !== "number") return "missing";
    return Number.isFinite(value) ? "valid" : "nonFinite";
}

function varianceOutcome(variance: FiniteValue, direction: VarianceDirection): VarianceOutcome {
    if (variance === null) return "unknown";
    if (variance === 0 || direction === "neutral") return "neutral";
    return variance > 0 ? "favorable" : "unfavorable";
}

export function calculateSemanticVariance(
    actualValue: unknown,
    referenceValue: unknown,
    semantics: VarianceSemantics = DEFAULT_VARIANCE_SEMANTICS
): SemanticVariance {
    const actualState = inputState(actualValue);
    const referenceState = inputState(referenceValue);
    const actual = toFiniteNumber(actualValue);
    const reference = toFiniteNumber(referenceValue);
    const base = {
        aggregation: semantics.aggregation,
        direction: semantics.direction,
        actual,
        reference
    };

    if (actualState === "nonFinite" || referenceState === "nonFinite") {
        return { ...base, kind: "nonFinite", outcome: "unknown", variance: null, percentage: null };
    }
    if (actualState === "missing" || referenceState === "missing") {
        return { ...base, kind: "missing", outcome: "unknown", variance: null, percentage: null };
    }

    const rawVariance = safeSubtract(actual, reference);
    if (rawVariance === null) {
        return { ...base, kind: "nonFinite", outcome: "unknown", variance: null, percentage: null };
    }
    const sign = semantics.direction === "lowerIsBetter" ? -1 : 1;
    const variance = toFiniteNumber(rawVariance * sign);
    if (variance === null) {
        return { ...base, kind: "nonFinite", outcome: "unknown", variance: null, percentage: null };
    }
    if (reference === 0) {
        return {
            ...base,
            kind: "zeroReference",
            outcome: varianceOutcome(variance, semantics.direction),
            variance,
            percentage: null
        };
    }

    const rawPercentage = calculatePercentage(rawVariance, reference);
    const percentage = rawPercentage === null ? null : toFiniteNumber(rawPercentage * sign);
    if (percentage === null) {
        return { ...base, kind: "nonFinite", outcome: "unknown", variance: null, percentage: null };
    }
    return {
        ...base,
        kind: "valid",
        outcome: varianceOutcome(variance, semantics.direction),
        variance,
        percentage
    };
}

export function finiteSum(values: FiniteValue[]): FiniteValue {
    let total = 0;
    let hasValue = false;
    for (const value of values) {
        if (value === null) continue;
        const next = total + value;
        if (!Number.isFinite(next)) return null;
        total = next;
        hasValue = true;
    }
    return hasValue ? total : null;
}

export function finiteStackExtents(values: FiniteValue[]): [number, number] {
    let negative = 0;
    let positive = 0;
    for (const value of values) {
        if (value === null) continue;
        if (value >= 0) {
            const next = safeAdd(positive, value);
            if (next === null) {
                return [
                    Math.min(0, ...values.filter((item): item is number => item !== null && Number.isFinite(item) && item < 0)),
                    Math.max(0, ...values.filter((item): item is number => item !== null && Number.isFinite(item) && item > 0))
                ];
            }
            positive = next;
        } else {
            const next = safeAdd(negative, value);
            if (next === null) {
                return [
                    Math.min(0, ...values.filter((item): item is number => item !== null && Number.isFinite(item) && item < 0)),
                    Math.max(0, ...values.filter((item): item is number => item !== null && Number.isFinite(item) && item > 0))
                ];
            }
            negative = next;
        }
    }
    return [negative, positive];
}

function valueAt(
    column: ValueColumnInfo | undefined,
    index: number,
    highlighted = false
): FiniteValue {
    if (!column) return null;
    const values = highlighted ? column.highlights : column.values;
    return values ? toFiniteNumber(values[index]) : null;
}

function textAt(values: PrimitiveValue[], index: number): string {
    const value = values[index];
    return value === null || value === undefined ? "" : String(value);
}

function rawAt(values: PrimitiveValue[], index: number): PrimitiveValue | undefined {
    return values[index];
}

function rawMeasureAt(column: ValueColumnInfo | undefined, index: number): unknown {
    return column?.values[index];
}

function primitiveKey(value: PrimitiveValue | undefined): string {
    if (value instanceof Date) return `date:${value.getTime()}`;
    return `${typeof value}:${String(value)}`;
}

export function getDataPointGroupKey(point: DataPoint): string {
    return point.groupKey ?? primitiveKey(point.groupValue === undefined ? point.group : point.groupValue);
}

export function getGroupKeys(data: ParsedData): string[] {
    if (data.groupKeys) return data.groupKeys;
    return Array.from(new Set(data.dataPoints.map(getDataPointGroupKey)));
}

function varianceFields(actual: FiniteValue, comparison: FiniteValue): [FiniteValue, FiniteValue] {
    const state = calculateSemanticVariance(actual, comparison);
    return [state.variance, state.percentage];
}

export function subsetParsedData(data: ParsedData, dataPoints: DataPoint[]): ParsedData {
    let minValue = 0;
    let maxValue = 0;
    for (const point of dataPoints) {
        for (const value of [
            point.actual, point.budget, point.previousYear, point.forecast,
            point.varianceToBudget, point.varianceToPY, point.varianceToFC
        ]) {
            if (value !== null) {
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        }
    }

    const groupKeys = data.hasGroups
        ? Array.from(new Set(dataPoints.map(getDataPointGroupKey)))
        : [];
    const groupLabels = groupKeys.map(key =>
        dataPoints.find(point => getDataPointGroupKey(point) === key)?.group ?? ""
    );

    return {
        ...data,
        dataPoints,
        groups: groupLabels,
        groupKeys,
        hasGroups: data.hasGroups,
        hasComments: dataPoints.some(point => point.comment.trim() !== ""),
        hasHighlights: data.hasHighlights === true && dataPoints.some(point => point.highlighted === true),
        totals: {
            actual: finiteSum(dataPoints.map(point => point.actual)),
            budget: data.hasBudget ? finiteSum(dataPoints.map(point => point.budget)) : null,
            previousYear: data.hasPreviousYear ? finiteSum(dataPoints.map(point => point.previousYear)) : null,
            forecast: data.hasForecast ? finiteSum(dataPoints.map(point => point.forecast)) : null
        },
        minValue,
        maxValue
    };
}

export function parseDataView(dataView: DataView, locale?: string): ParsedData | null {
    if (!dataView?.categorical?.categories?.[0] || !dataView.categorical.values) {
        return null;
    }

    const { categories, values } = dataView.categorical;
    let categoryValues: PrimitiveValue[] = [];
    let groupValues: PrimitiveValue[] = [];
    let commentValues: PrimitiveValue[] = [];
    let categoryFormat: string | undefined;
    let groupFormat: string | undefined;

    for (const column of categories) {
        const roles = column.source.roles;
        if (roles?.["category"]) {
            categoryValues = column.values;
            categoryFormat = column.source.format;
        }
        if (roles?.["group"]) {
            groupValues = column.values;
            groupFormat = column.source.format;
        }
        if (roles?.["comments"]) commentValues = column.values;
    }
    if (categoryValues.length === 0) {
        categoryValues = categories[0].values;
        categoryFormat = categories[0].source.format;
    }

    let actualColumn: ValueColumnInfo | undefined;
    let budgetColumn: ValueColumnInfo | undefined;
    let pyColumn: ValueColumnInfo | undefined;
    let forecastColumn: ValueColumnInfo | undefined;
    const tooltipColumns: TooltipColumnInfo[] = [];

    for (const column of values) {
        const info: ValueColumnInfo = {
            values: column.values,
            highlights: column.highlights,
            format: column.source.format
        };
        const roles = column.source.roles;
        if (roles?.["actual"]) actualColumn = info;
        if (roles?.["budget"]) budgetColumn = info;
        if (roles?.["previousYear"]) pyColumn = info;
        if (roles?.["forecast"]) forecastColumn = info;
        if (roles?.["tooltips"]) {
            tooltipColumns.push({
                ...info,
                displayName: column.source.displayName || "Tooltip"
            });
        }
    }

    if (!actualColumn) return null;

    const dataPoints: DataPoint[] = [];
    const highlightColumns = [actualColumn, budgetColumn, pyColumn, forecastColumn];
    const hasHighlights = highlightColumns.some(column =>
        Array.isArray(column?.highlights)
        && column.highlights.some(value => value !== null && value !== undefined)
    );

    for (let i = 0; i < categoryValues.length; i++) {
        const actual = valueAt(actualColumn, i);
        const budget = valueAt(budgetColumn, i);
        const previousYear = valueAt(pyColumn, i);
        const forecast = valueAt(forecastColumn, i);
        const highlighted = hasHighlights && highlightColumns.some(column =>
            valueAt(column, i, true) !== null
        );
        const budgetState = calculateSemanticVariance(
            rawMeasureAt(actualColumn, i),
            rawMeasureAt(budgetColumn, i)
        );
        const previousYearState = calculateSemanticVariance(
            rawMeasureAt(actualColumn, i),
            rawMeasureAt(pyColumn, i)
        );
        const forecastState = calculateSemanticVariance(
            rawMeasureAt(actualColumn, i),
            rawMeasureAt(forecastColumn, i)
        );

        const tooltipFields = tooltipColumns.flatMap(column => {
            const rawValue = column.values[i];
            if (rawValue === null || rawValue === undefined || rawValue === "") return [];
            const formatted = typeof rawValue === "number"
                ? formatModelValue(toFiniteNumber(rawValue), column.format, locale)
                : formatPrimitiveValue(rawValue, column.format, locale);
            return formatted === null || formatted === ""
                ? []
                : [{ displayName: column.displayName, value: formatted, format: column.format }];
        });

        dataPoints.push({
            category: formatPrimitiveValue(rawAt(categoryValues, i), categoryFormat, locale),
            group: formatPrimitiveValue(rawAt(groupValues, i), groupFormat, locale),
            categoryValue: rawAt(categoryValues, i),
            groupValue: rawAt(groupValues, i),
            groupKey: groupValues.length > 0 ? primitiveKey(rawAt(groupValues, i)) : "",
            categoryFormat,
            groupFormat,
            actual,
            budget,
            previousYear,
            forecast,
            comment: textAt(commentValues, i),
            varianceToBudget: budgetState.variance,
            varianceToBudgetPct: budgetState.percentage,
            varianceToPY: previousYearState.variance,
            varianceToPYPct: previousYearState.percentage,
            varianceToFC: forecastState.variance,
            varianceToFCPct: forecastState.percentage,
            varianceStates: {
                budget: budgetState,
                previousYear: previousYearState,
                forecast: forecastState
            },
            tooltipFields,
            highlighted,
            index: i,
            sourceIndices: [i]
        });
    }

    const hasActual = dataPoints.some(point => point.actual !== null);
    const hasBudget = dataPoints.some(point => point.budget !== null);
    const hasPreviousYear = dataPoints.some(point => point.previousYear !== null);
    const hasForecast = dataPoints.some(point => point.forecast !== null);
    const parsed: ParsedData = {
        dataPoints: [],
        groups: [],
        groupKeys: [],
        hasActual,
        hasBudget,
        hasPreviousYear,
        hasForecast,
        hasGroups: groupValues.length > 0,
        hasComments: commentValues.length > 0,
        hasHighlights,
        totals: { actual: null, budget: null, previousYear: null, forecast: null },
        maxValue: 0,
        minValue: 0,
        formats: {
            actual: actualColumn.format,
            budget: budgetColumn?.format,
            previousYear: pyColumn?.format,
            forecast: forecastColumn?.format
        },
        locale,
        completeness: dataView.metadata?.segment || dataView.metadata?.dataReduction
            ? { state: "partial", reason: "hostDataReduction" }
            : { state: "complete" }
    };
    return subsetParsedData(parsed, dataPoints);
}

export function getVariance(dataPoint: DataPoint, comparisonType: ComparisonType): FiniteValue {
    switch (comparisonType) {
        case "budget": return dataPoint.varianceToBudget;
        case "previousYear": return dataPoint.varianceToPY;
        case "forecast": return dataPoint.varianceToFC;
    }
}

export function getVariancePct(dataPoint: DataPoint, comparisonType: ComparisonType): FiniteValue {
    switch (comparisonType) {
        case "budget": return dataPoint.varianceToBudgetPct;
        case "previousYear": return dataPoint.varianceToPYPct;
        case "forecast": return dataPoint.varianceToFCPct;
    }
}

export function getSemanticVariance(
    dataPoint: DataPoint,
    comparisonType: ComparisonType,
    semantics: VarianceSemantics = DEFAULT_VARIANCE_SEMANTICS
): SemanticVariance {
    const stored = dataPoint.varianceStates?.[comparisonType];
    if (stored) {
        const storedSign = stored.direction === "lowerIsBetter" ? -1 : 1;
        const requestedSign = semantics.direction === "lowerIsBetter" ? -1 : 1;
        const variance = stored.variance === null
            ? null
            : toFiniteNumber(stored.variance * storedSign * requestedSign);
        const percentage = stored.percentage === null
            ? null
            : toFiniteNumber(stored.percentage * storedSign * requestedSign);
        return {
            ...stored,
            aggregation: semantics.aggregation,
            direction: semantics.direction,
            outcome: varianceOutcome(variance, semantics.direction),
            variance,
            percentage
        };
    }
    return calculateSemanticVariance(dataPoint.actual, dataPoint[comparisonType], semantics);
}

export function getComparisonValue(dataPoint: DataPoint, comparisonType: ComparisonType): FiniteValue {
    return dataPoint[comparisonType];
}

export function getAvailableComparisonType(
    data: ParsedData,
    preferred: ComparisonType
): ComparisonType | null {
    const availability: Record<ComparisonType, boolean> = {
        budget: data.hasBudget,
        previousYear: data.hasPreviousYear,
        forecast: data.hasForecast
    };
    if (availability[preferred]) return preferred;
    return (["budget", "previousYear", "forecast"] as ComparisonType[])
        .find(type => availability[type]) ?? null;
}

export interface TopNOptions {
    enable: boolean;
    count: number;
    sortBy: string;
    sortDirection: string;
    showOthers: boolean;
    othersLabel: string;
    comparisonType: ComparisonType;
    aggregation?: VarianceAggregation;
    /** Display direction used by labels/tooltips; ranking must use the same sign. */
    direction?: VarianceDirection;
    /** Backwards-compatible shorthand for direction. */
    invertVariance?: boolean;
}

function sortableValue(value: FiniteValue, direction: string): number {
    if (value !== null) return value;
    return direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function aggregateMeasure(points: DataPoint[], key: MeasureKey): FiniteValue {
    return finiteSum(points.map(point => point[key]));
}

export function applyTopN(data: ParsedData, options: TopNOptions): ParsedData {
    if (!options.enable) {
        return {
            ...data,
            topNState: {
                applied: false,
                completeness: data.completeness?.state ?? "complete",
                others: "notRequested"
            }
        };
    }
    const count = Math.max(0, Math.floor(options.count));
    const completeness = data.completeness?.state ?? "complete";
    const aggregation = options.aggregation ?? "additive";
    const varianceDirection: VarianceDirection = options.direction
        ?? (options.invertVariance ? "lowerIsBetter" : "higherIsBetter");
    let othersState: TopNState["others"] = options.showOthers ? "notNeeded" : "notRequested";

    const rankPoints = (points: DataPoint[], group: string, groupKey: string): DataPoint[] => {
        if (points.length <= count) return points;
        const sorted = [...points].sort((a, b) => {
        if (options.sortBy === "name") {
            const comparison = a.category.localeCompare(b.category);
            return options.sortDirection === "asc" ? comparison : -comparison;
        }
        const aValue = options.sortBy === "variance"
            ? getSemanticVariance(a, options.comparisonType, {
                aggregation,
                direction: varianceDirection
            }).variance
            : a.actual;
        const bValue = options.sortBy === "variance"
            ? getSemanticVariance(b, options.comparisonType, {
                aggregation,
                direction: varianceDirection
            }).variance
            : b.actual;
        const aSortable = sortableValue(aValue, options.sortDirection);
        const bSortable = sortableValue(bValue, options.sortDirection);
        if (aSortable !== bSortable) {
            return options.sortDirection === "asc"
                ? aSortable - bSortable
                : bSortable - aSortable;
        }
        // Make ties deterministic across runtimes and malformed host rows.
        const nameTie = a.category.localeCompare(b.category);
        if (nameTie !== 0) return nameTie;
        return (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER);
        });
        const topN = sorted.slice(0, count);
        const rest = sorted.slice(count);

        if (!options.showOthers || rest.length === 0) return topN;
        if (completeness === "partial") {
            othersState = "omittedPartial";
            return topN;
        }
        if (aggregation === "nonAdditive") {
            othersState = "omittedNonAdditive";
            return topN;
        }
        const actual = aggregateMeasure(rest, "actual");
        const budget = data.hasBudget ? aggregateMeasure(rest, "budget") : null;
        const previousYear = data.hasPreviousYear ? aggregateMeasure(rest, "previousYear") : null;
        const forecast = data.hasForecast ? aggregateMeasure(rest, "forecast") : null;
        const budgetState = calculateSemanticVariance(actual, budget, { aggregation, direction: "higherIsBetter" });
        const previousYearState = calculateSemanticVariance(
            actual,
            previousYear,
            { aggregation, direction: "higherIsBetter" }
        );
        const forecastState = calculateSemanticVariance(
            actual,
            forecast,
            { aggregation, direction: "higherIsBetter" }
        );

        topN.push({
            category: options.othersLabel,
            group,
            categoryValue: options.othersLabel,
            groupValue: rest[0]?.groupValue,
            groupKey,
            categoryFormat: undefined,
            groupFormat: rest[0]?.groupFormat,
            actual,
            budget,
            previousYear,
            forecast,
            comment: "",
            varianceToBudget: budgetState.variance,
            varianceToBudgetPct: budgetState.percentage,
            varianceToPY: previousYearState.variance,
            varianceToPYPct: previousYearState.percentage,
            varianceToFC: forecastState.variance,
            varianceToFCPct: forecastState.percentage,
            varianceStates: {
                budget: budgetState,
                previousYear: previousYearState,
                forecast: forecastState
            },
            tooltipFields: [],
            highlighted: data.hasHighlights === true && rest.some(point => point.highlighted === true),
            index: null,
            sourceIndices: rest.flatMap(point => point.sourceIndices),
            isSynthetic: true
        });
        othersState = "complete";
        return topN;
    };

    if (!data.hasGroups) {
        const result = subsetParsedData(data, rankPoints(data.dataPoints, "", ""));
        return {
            ...result,
            topNState: { applied: true, completeness, others: othersState }
        };
    }

    const ranked: DataPoint[] = [];
    for (const groupKey of getGroupKeys(data)) {
        const points = data.dataPoints.filter(point => getDataPointGroupKey(point) === groupKey);
        const group = points[0]?.group ?? "";
        ranked.push(...rankPoints(points, group, groupKey));
    }
    const result = subsetParsedData(data, ranked);
    return {
        ...result,
        topNState: { applied: true, completeness, others: othersState }
    };
}
