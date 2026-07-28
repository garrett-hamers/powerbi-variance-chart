/**
 * IBCS Color utilities and schemes
 */

export interface IBCSColors {
    actual: string;
    budget: string;
    previousYear: string;
    forecast: string;
    positiveVariance: string;
    negativeVariance: string;
}

/**
 * Canonical IBCS palette. Actual is solid dark, plan/forecast/previous year are
 * progressively lighter neutrals, and variances use the standard green/red pair.
 */
export const DEFAULT_IBCS_COLORS: IBCSColors = {
    actual: "#404040",
    budget: "#808080",
    previousYear: "#9E9E9E",
    forecast: "#606060",
    positiveVariance: "#4CAF50",
    negativeVariance: "#F44336"
};

/**
 * Get variance color based on value
 */
export function getVarianceColor(value: number, colors: IBCSColors): string {
    if (value === 0 || !Number.isFinite(value)) return colors.actual;
    return value > 0 ? colors.positiveVariance : colors.negativeVariance;
}
