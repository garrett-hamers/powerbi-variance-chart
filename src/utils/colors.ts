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

// Default IBCS-compliant color scheme
export const DEFAULT_IBCS_COLORS: IBCSColors = {
    actual: "#404040",           // Solid dark gray
    budget: "#808080",           // Medium gray (outlined)
    previousYear: "#9E9E9E",     // Light gray
    forecast: "#606060",         // Medium dark gray (hatched)
    positiveVariance: "#4CAF50", // Green
    negativeVariance: "#F44336"  // Red
};

/**
 * Get variance color based on value
 */
export function getVarianceColor(value: number, colors: IBCSColors): string {
    return value >= 0 ? colors.positiveVariance : colors.negativeVariance;
}

/**
 * Generate IBCS-style pattern for forecast (hatched lines)
 */
export function createHatchPattern(svgDefs: d3.Selection<SVGDefsElement, unknown, null, undefined>, color: string): string {
    const patternId = "hatch-pattern";
    
    // Remove existing pattern if any
    svgDefs.select(`#${patternId}`).remove();
    
    const pattern = svgDefs.append("pattern")
        .attr("id", patternId)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 4)
        .attr("height", 4);
    
    pattern.append("rect")
        .attr("width", 4)
        .attr("height", 4)
        .attr("fill", "white");
    
    pattern.append("path")
        .attr("d", "M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2")
        .attr("stroke", color)
        .attr("stroke-width", 1);
    
    return `url(#${patternId})`;
}

/**
 * Apply IBCS styling to a bar element
 */
export function applyBarStyle(
    element: d3.Selection<SVGRectElement, unknown, null, undefined>,
    type: "actual" | "budget" | "previousYear" | "forecast" | "variance",
    colors: IBCSColors,
    varianceValue?: number
): void {
    switch (type) {
        case "actual":
            element
                .attr("fill", colors.actual)
                .attr("stroke", "none");
            break;
        case "budget":
            element
                .attr("fill", "none")
                .attr("stroke", colors.budget)
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "4,2");
            break;
        case "previousYear":
            element
                .attr("fill", colors.previousYear)
                .attr("stroke", "none")
                .attr("opacity", 0.6);
            break;
        case "forecast":
            // Forecast uses hatched pattern - handled separately
            element
                .attr("fill", colors.forecast)
                .attr("stroke", "none")
                .attr("opacity", 0.8);
            break;
        case "variance":
            const color = varianceValue !== undefined 
                ? getVarianceColor(varianceValue, colors) 
                : colors.positiveVariance;
            element
                .attr("fill", color)
                .attr("stroke", "none");
            break;
    }
}

// Import d3 types for TypeScript
import * as d3 from "d3";
