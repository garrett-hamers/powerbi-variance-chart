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
 * Get variance color based on value
 */
export function getVarianceColor(value: number, colors: IBCSColors): string {
    if (value === 0 || !Number.isFinite(value)) return colors.actual;
    return value > 0 ? colors.positiveVariance : colors.negativeVariance;
}
