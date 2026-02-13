/**
 * Data Parser - Handles data transformation and automatic variance calculations
 */
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;

export interface TooltipField {
    displayName: string;
    value: string;
}

export interface DataPoint {
    category: string;
    group: string;
    actual: number;
    budget: number;
    previousYear: number;
    forecast: number;
    comment: string;
    // Auto-calculated variances
    varianceToBudget: number;
    varianceToBudgetPct: number;
    varianceToPY: number;
    varianceToPYPct: number;
    varianceToFC: number;
    varianceToFCPct: number;
    tooltipFields?: TooltipField[];
    // For waterfall
    index: number;
}

export interface ParsedData {
    dataPoints: DataPoint[];
    groups: string[];
    hasActual: boolean;
    hasBudget: boolean;
    hasPreviousYear: boolean;
    hasForecast: boolean;
    hasGroups: boolean;
    hasComments: boolean;
    totals: {
        actual: number;
        budget: number;
        previousYear: number;
        forecast: number;
    };
    maxValue: number;
    minValue: number;
}

export type ComparisonType = "budget" | "previousYear" | "forecast";

export function parseDataView(dataView: DataView): ParsedData | null {
    if (!dataView?.categorical?.categories?.[0] || !dataView.categorical.values) {
        return null;
    }

    const categorical = dataView.categorical;
    const allCategories = categorical.categories;
    const values = categorical.values;

    // Find category columns by role
    let categoryValues: powerbi.PrimitiveValue[] = [];
    let groupValues: powerbi.PrimitiveValue[] = [];
    let commentValues: powerbi.PrimitiveValue[] = [];

    for (const cat of allCategories) {
        const role = cat.source.roles;
        if (role) {
            if (role["category"]) categoryValues = cat.values;
            if (role["group"]) groupValues = cat.values;
            if (role["comments"]) commentValues = cat.values;
        }
    }

    // Use first category if no specific role found
    if (categoryValues.length === 0 && allCategories.length > 0) {
        categoryValues = allCategories[0].values;
    }

    // Find measure columns by role
    let actualValues: powerbi.PrimitiveValue[] = [];
    let budgetValues: powerbi.PrimitiveValue[] = [];
    let pyValues: powerbi.PrimitiveValue[] = [];
    let forecastValues: powerbi.PrimitiveValue[] = [];
    const tooltipColumns: Array<{ displayName: string; values: powerbi.PrimitiveValue[] }> = [];

    for (const valueColumn of values) {
        const roles = valueColumn.source.roles;
        if (roles) {
            if (roles["actual"]) actualValues = valueColumn.values;
            if (roles["budget"]) budgetValues = valueColumn.values;
            if (roles["previousYear"]) pyValues = valueColumn.values;
            if (roles["forecast"]) forecastValues = valueColumn.values;
            if (roles["tooltips"]) {
                tooltipColumns.push({
                    displayName: valueColumn.source.displayName || "Tooltip",
                    values: valueColumn.values
                });
            }
        }
    }

    const hasActual = actualValues.length > 0;
    const hasBudget = budgetValues.length > 0;
    const hasPreviousYear = pyValues.length > 0;
    const hasForecast = forecastValues.length > 0;
    const hasGroups = groupValues.length > 0;
    const hasComments = commentValues.length > 0;

    if (!hasActual) {
        return null;
    }

    const dataPoints: DataPoint[] = [];
    const groupsSet = new Set<string>();
    let maxValue = 0;
    let minValue = 0;

    for (let i = 0; i < categoryValues.length; i++) {
        const actual = Number(actualValues[i]) || 0;
        const budget = hasBudget ? (Number(budgetValues[i]) || 0) : 0;
        const previousYear = hasPreviousYear ? (Number(pyValues[i]) || 0) : 0;
        const forecast = hasForecast ? (Number(forecastValues[i]) || 0) : 0;
        const group = hasGroups ? String(groupValues[i] || "") : "";
        const comment = hasComments ? String(commentValues[i] || "") : "";
        const tooltipFields = tooltipColumns
            .map((column) => {
                const rawValue = column.values[i];
                if (rawValue == null || rawValue === "") {
                    return null;
                }
                return { displayName: column.displayName, value: String(rawValue) };
            })
            .filter((field): field is TooltipField => field !== null);

        if (group) groupsSet.add(group);

        // Calculate variances
        const varianceToBudget = actual - budget;
        const varianceToBudgetPct = calculatePercentage(varianceToBudget, budget);
        
        const varianceToPY = actual - previousYear;
        const varianceToPYPct = calculatePercentage(varianceToPY, previousYear);
        
        const varianceToFC = actual - forecast;
        const varianceToFCPct = calculatePercentage(varianceToFC, forecast);

        const dataPoint: DataPoint = {
            category: String(categoryValues[i]),
            group,
            actual,
            budget,
            previousYear,
            forecast,
            comment,
            varianceToBudget,
            varianceToBudgetPct,
            varianceToPY,
            varianceToPYPct,
            varianceToFC,
            varianceToFCPct,
            tooltipFields,
            index: i
        };

        dataPoints.push(dataPoint);

        // Track max/min for scale
        const allValues = [actual, budget, previousYear, forecast, 
                          varianceToBudget, varianceToPY, varianceToFC];
        maxValue = Math.max(maxValue, ...allValues.filter(v => v !== 0));
        minValue = Math.min(minValue, ...allValues);
    }

    // Calculate totals
    const totals = {
        actual: dataPoints.reduce((sum, d) => sum + d.actual, 0),
        budget: dataPoints.reduce((sum, d) => sum + d.budget, 0),
        previousYear: dataPoints.reduce((sum, d) => sum + d.previousYear, 0),
        forecast: dataPoints.reduce((sum, d) => sum + d.forecast, 0)
    };

    return {
        dataPoints,
        groups: Array.from(groupsSet),
        hasActual,
        hasBudget,
        hasPreviousYear,
        hasForecast,
        hasGroups,
        hasComments,
        totals,
        maxValue,
        minValue
    };
}

function calculatePercentage(variance: number, base: number): number {
    if (base === 0) return 0;
    return (variance / Math.abs(base)) * 100;
}

/**
 * Get variance value based on comparison type
 */
export function getVariance(dataPoint: DataPoint, comparisonType: ComparisonType): number {
    switch (comparisonType) {
        case "budget": return dataPoint.varianceToBudget;
        case "previousYear": return dataPoint.varianceToPY;
        case "forecast": return dataPoint.varianceToFC;
        default: return dataPoint.varianceToBudget;
    }
}

/**
 * Get variance percentage based on comparison type
 */
export function getVariancePct(dataPoint: DataPoint, comparisonType: ComparisonType): number {
    switch (comparisonType) {
        case "budget": return dataPoint.varianceToBudgetPct;
        case "previousYear": return dataPoint.varianceToPYPct;
        case "forecast": return dataPoint.varianceToFCPct;
        default: return dataPoint.varianceToBudgetPct;
    }
}

/**
 * Get comparison value based on type
 */
export function getComparisonValue(dataPoint: DataPoint, comparisonType: ComparisonType): number {
    switch (comparisonType) {
        case "budget": return dataPoint.budget;
        case "previousYear": return dataPoint.previousYear;
        case "forecast": return dataPoint.forecast;
        default: return dataPoint.budget;
    }
}

/**
 * Top N + Others - Filter and aggregate data
 */
export interface TopNOptions {
    enable: boolean;
    count: number;
    sortBy: string;
    sortDirection: string;
    showOthers: boolean;
    othersLabel: string;
    comparisonType: ComparisonType;
}

export function applyTopN(data: ParsedData, options: TopNOptions): ParsedData {
    if (!options.enable || data.dataPoints.length <= options.count) {
        return data;
    }

    const sorted = [...data.dataPoints].sort((a, b) => {
        let valA: number, valB: number;
        
        if (options.sortBy === "name") {
            const cmp = a.category.localeCompare(b.category);
            return options.sortDirection === "asc" ? cmp : -cmp;
        } else if (options.sortBy === "variance") {
            valA = getVariance(a, options.comparisonType);
            valB = getVariance(b, options.comparisonType);
        } else {
            valA = a.actual;
            valB = b.actual;
        }
        
        return options.sortDirection === "asc" ? valA - valB : valB - valA;
    });

    const topN = sorted.slice(0, options.count);
    const rest = sorted.slice(options.count);

    if (options.showOthers && rest.length > 0) {
        const othersPoint: DataPoint = {
            category: options.othersLabel,
            group: "",
            actual: rest.reduce((s, d) => s + d.actual, 0),
            budget: rest.reduce((s, d) => s + d.budget, 0),
            previousYear: rest.reduce((s, d) => s + d.previousYear, 0),
            forecast: rest.reduce((s, d) => s + d.forecast, 0),
            comment: "",
            varianceToBudget: 0,
            varianceToBudgetPct: 0,
            varianceToPY: 0,
            varianceToPYPct: 0,
            varianceToFC: 0,
            varianceToFCPct: 0,
            index: options.count
        };
        // Recalculate variances for Others
        othersPoint.varianceToBudget = othersPoint.actual - othersPoint.budget;
        othersPoint.varianceToBudgetPct = calculatePercentage(othersPoint.varianceToBudget, othersPoint.budget);
        othersPoint.varianceToPY = othersPoint.actual - othersPoint.previousYear;
        othersPoint.varianceToPYPct = calculatePercentage(othersPoint.varianceToPY, othersPoint.previousYear);
        othersPoint.varianceToFC = othersPoint.actual - othersPoint.forecast;
        othersPoint.varianceToFCPct = calculatePercentage(othersPoint.varianceToFC, othersPoint.forecast);

        topN.push(othersPoint);
    }

    return {
        ...data,
        dataPoints: topN
    };
}
