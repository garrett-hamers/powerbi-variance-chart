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
    tooltipFields?: TooltipField[];
    /** True when Power BI supplied a non-null highlight value for this row. */
    highlighted?: boolean;
    /** Original categorical row. Aggregates and synthetic points do not have one. */
    index: number | null;
    /** Original rows represented by this point (one for normal points, many for Others). */
    sourceIndices: number[];
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
    const variance = safeSubtract(actual, comparison);
    return [variance, calculatePercentage(variance, comparison)];
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
        const [varianceToBudget, varianceToBudgetPct] = varianceFields(actual, budget);
        const [varianceToPY, varianceToPYPct] = varianceFields(actual, previousYear);
        const [varianceToFC, varianceToFCPct] = varianceFields(actual, forecast);

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
            varianceToBudget,
            varianceToBudgetPct,
            varianceToPY,
            varianceToPYPct,
            varianceToFC,
            varianceToFCPct,
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
        locale
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
}

function sortableValue(value: FiniteValue, direction: string): number {
    if (value !== null) return value;
    return direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function aggregateMeasure(points: DataPoint[], key: MeasureKey): FiniteValue {
    return finiteSum(points.map(point => point[key]));
}

export function applyTopN(data: ParsedData, options: TopNOptions): ParsedData {
    if (!options.enable) return data;
    const count = Math.max(0, Math.floor(options.count));

    const rankPoints = (points: DataPoint[], group: string, groupKey: string): DataPoint[] => {
        if (points.length <= count) return points;
        const sorted = [...points].sort((a, b) => {
        if (options.sortBy === "name") {
            const comparison = a.category.localeCompare(b.category);
            return options.sortDirection === "asc" ? comparison : -comparison;
        }
        const aValue = options.sortBy === "variance"
            ? getVariance(a, options.comparisonType)
            : a.actual;
        const bValue = options.sortBy === "variance"
            ? getVariance(b, options.comparisonType)
            : b.actual;
        const difference = sortableValue(aValue, options.sortDirection) - sortableValue(bValue, options.sortDirection);
        return options.sortDirection === "asc" ? difference : -difference;
        });
        const topN = sorted.slice(0, count);
        const rest = sorted.slice(count);

        if (!options.showOthers || rest.length === 0) return topN;
        const actual = aggregateMeasure(rest, "actual");
        const budget = data.hasBudget ? aggregateMeasure(rest, "budget") : null;
        const previousYear = data.hasPreviousYear ? aggregateMeasure(rest, "previousYear") : null;
        const forecast = data.hasForecast ? aggregateMeasure(rest, "forecast") : null;
        const [varianceToBudget, varianceToBudgetPct] = varianceFields(actual, budget);
        const [varianceToPY, varianceToPYPct] = varianceFields(actual, previousYear);
        const [varianceToFC, varianceToFCPct] = varianceFields(actual, forecast);

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
            varianceToBudget,
            varianceToBudgetPct,
            varianceToPY,
            varianceToPYPct,
            varianceToFC,
            varianceToFCPct,
            tooltipFields: [],
            highlighted: data.hasHighlights === true && rest.some(point => point.highlighted === true),
            index: null,
            sourceIndices: rest.flatMap(point => point.sourceIndices)
        });
        return topN;
    };

    if (!data.hasGroups) {
        return subsetParsedData(data, rankPoints(data.dataPoints, "", ""));
    }

    const ranked: DataPoint[] = [];
    for (const groupKey of getGroupKeys(data)) {
        const points = data.dataPoints.filter(point => getDataPointGroupKey(point) === groupKey);
        const group = points[0]?.group ?? "";
        ranked.push(...rankPoints(points, group, groupKey));
    }
    return subsetParsedData(data, ranked);
}
