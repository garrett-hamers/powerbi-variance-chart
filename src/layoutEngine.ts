/**
 * Layout Engine - Pure function for calculating chart layout
 * Extracted from visual.ts for testability
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ChartLayout {
    titleArea?: Rect;
    legendArea?: Rect;
    commentBoxArea?: Rect;
    chartArea: Rect;
}

export interface Margins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface LayoutDimensions {
    width: number;
    height: number;
    margin: Margins;
    layout?: ChartLayout;
}

export interface LayoutConfig {
    title: { show: boolean };
    legend: { show: boolean; position: "top" | "bottom" | "left" | "right" };
    commentBox: { show: boolean };
    categories: { show: boolean; rotation: number; maxWidth: number; fontSize: number };
    hasComments: boolean;
    chartType: string;
    breakpoint: string;
}

/**
 * Pure function that calculates the layout for the visual.
 * All peripheral elements (title, legend, comment box) carve space from the viewport.
 * The remaining space becomes the chart area.
 * Final margins encode the chart container's position within the viewport.
 */
export function calculateLayout(width: number, height: number, config: LayoutConfig): LayoutDimensions {
    const layout: ChartLayout = {
        chartArea: { x: 0, y: 0, width, height }
    };

    // Compact margins for small breakpoints (no peripherals)
    if (config.breakpoint === "small") {
        return {
            width, height,
            margin: { top: 5, right: 15, bottom: 25, left: 35 },
            layout
        };
    }

    // Available rect starts as full viewport
    const available: Rect = { x: 0, y: 0, width, height };

    // 1. Title (Top)
    if (config.title.show) {
        const h = 30;
        layout.titleArea = { x: available.x, y: available.y, width: available.width, height: h };
        available.y += h;
        available.height -= h;
    }

    // 2. Legend
    if (config.legend.show) {
        const position = config.legend.position;
        const size = (position === "top" || position === "bottom") ? 30 : 80;

        if (position === "top") {
            layout.legendArea = { x: available.x, y: available.y, width: available.width, height: size };
            available.y += size;
            available.height -= size;
        } else if (position === "bottom") {
            layout.legendArea = { x: available.x, y: available.y + available.height - size, width: available.width, height: size };
            available.height -= size;
        } else if (position === "left") {
            layout.legendArea = { x: available.x, y: available.y, width: size, height: available.height };
            available.x += size;
            available.width -= size;
        } else { // right
            layout.legendArea = { x: available.x + available.width - size, y: available.y, width: size, height: available.height };
            available.width -= size;
        }
    }

    // 3. Comment Box — always right (ZebraBI-style)
    if (config.commentBox.show && config.hasComments) {
        const w = 220;
        layout.commentBoxArea = { x: available.x + available.width - w, y: available.y, width: w, height: available.height };
        available.width -= w;
    }

    // Remaining available rect is the chart area
    layout.chartArea = { ...available };

    // 4. Calculate axis margins
    let axisBottom = 60;
    if (config.categories.show) {
        const rot = Math.abs(config.categories.rotation);
        if (rot === 0) {
            axisBottom = 30 + config.categories.fontSize * 2;
        } else {
            const rotatedHeight = Math.min(config.categories.maxWidth, 150) * Math.sin(rot * Math.PI / 180);
            axisBottom = 30 + rotatedHeight + 10;
        }
    }
    if (config.chartType === "waterfall") axisBottom += 20;

    const axisMargins: Margins = { top: 30, right: 30, bottom: axisBottom, left: 60 };
    if (config.breakpoint === "medium") {
        axisMargins.top = 20;
        axisMargins.right = 30;
        axisMargins.bottom = Math.min(axisBottom, 60);
        axisMargins.left = 50;
    }
    if (config.chartType === "lollipop") axisMargins.left = 100;

    // Final margins = peripheral offset + axis margins
    const finalMargins: Margins = {
        top: available.y + axisMargins.top,
        left: available.x + axisMargins.left,
        right: (width - (available.x + available.width)) + axisMargins.right,
        bottom: (height - (available.y + available.height)) + axisMargins.bottom
    };

    // Clamp margins so chart area is never negative
    const maxHorizontalMargin = width - 50; // minimum 50px chart width
    const maxVerticalMargin = height - 30;  // minimum 30px chart height
    
    if (finalMargins.left + finalMargins.right > maxHorizontalMargin) {
        const scale = maxHorizontalMargin / (finalMargins.left + finalMargins.right);
        finalMargins.left = Math.floor(finalMargins.left * scale);
        finalMargins.right = Math.floor(finalMargins.right * scale);
    }
    if (finalMargins.top + finalMargins.bottom > maxVerticalMargin) {
        const scale = maxVerticalMargin / (finalMargins.top + finalMargins.bottom);
        finalMargins.top = Math.floor(finalMargins.top * scale);
        finalMargins.bottom = Math.floor(finalMargins.bottom * scale);
    }

    return { width, height, margin: finalMargins, layout };
}

/**
 * Compute chart drawing area dimensions from layout dimensions.
 */
export function getChartArea(dims: LayoutDimensions): { chartWidth: number; chartHeight: number } {
    return {
        chartWidth: dims.width - dims.margin.left - dims.margin.right,
        chartHeight: dims.height - dims.margin.top - dims.margin.bottom
    };
}

/**
 * Compute comment box position relative to the chart container (which is at margin.left, margin.top).
 * Comment box is always placed on the right (ZebraBI-style).
 */
export function getCommentBoxPosition(
    dims: LayoutDimensions
): { x: number; y: number; boxWidth: number; boxHeight: number } | null {
    const { chartWidth, chartHeight } = getChartArea(dims);
    const x = chartWidth + 10;
    const commentAllocation = dims.layout?.commentBoxArea
        ? dims.layout.commentBoxArea.width
        : 220;
    const boxWidth = Math.max(80, commentAllocation - 30);
    return { x, y: 0, boxWidth, boxHeight: chartHeight };
}

/**
 * Compute legend position relative to the chart container.
 */
export function getLegendPosition(
    dims: LayoutDimensions,
    legendPosition: string,
    commentBoxOnRight: boolean,
    itemCount: number
): { x: number; y: number } {
    const { chartWidth, chartHeight } = getChartArea(dims);

    switch (legendPosition) {
        case "top":
            return { x: chartWidth / 2 - (itemCount * 70) / 2, y: -25 };
        case "bottom":
            return { x: chartWidth / 2 - (itemCount * 70) / 2, y: chartHeight + 30 };
        case "left":
            return { x: -dims.margin.left + 5, y: 0 };
        default: { // right
            const commentOffset = commentBoxOnRight ? 220 : 0;
            return { x: chartWidth + commentOffset + 10, y: 0 };
        }
    }
}

// ─── Small Multiples Layout ───

export interface SmallMultiplesConfig {
    columns: number;       // 0 = auto
    spacing: number;
    showHeaders: boolean;
    categoryRotation: number;  // e.g. -45
    categoryMaxWidth: number;
    categoryFontSize: number;
}

export interface SmallMultiplesGrid {
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
}

export interface SmallMultiplesCellLayout {
    /** Position of cell SVG within the viewport */
    x: number;
    y: number;
    /** Inner margins for the chart within the cell */
    margin: Margins;
    /** Height reserved for the group header text */
    headerHeight: number;
    /** Chart drawing width inside the cell */
    chartWidth: number;
    /** Chart drawing height inside the cell */
    chartHeight: number;
}

/**
 * Calculate the small multiples grid dimensions.
 */
export function calculateSmallMultiplesGrid(
    totalWidth: number,
    totalHeight: number,
    groupCount: number,
    config: SmallMultiplesConfig
): SmallMultiplesGrid {
    let cols = config.columns;
    if (cols <= 0) {
        cols = Math.min(groupCount, Math.max(1, Math.floor(totalWidth / 250)));
    }
    const rows = Math.ceil(groupCount / cols);

    // Safety buffer prevents rounding errors from causing overflow
    const safetyBuffer = 10;
    const cellWidth = Math.floor((totalWidth - safetyBuffer - config.spacing * (cols + 1)) / cols);
    const cellHeight = Math.floor((totalHeight - config.spacing * (rows + 1)) / rows);

    return { cols, rows, cellWidth, cellHeight };
}

/**
 * Compute the viewport available for the small multiples grid
 * after peripherals (title, legend, comment box) have carved their space.
 * Returns an absolute-positioned rect within the full viewport.
 */
export function getSmallMultiplesViewport(
    totalWidth: number,
    totalHeight: number,
    config: LayoutConfig
): Rect {
    const available: Rect = { x: 0, y: 0, width: totalWidth, height: totalHeight };

    // Title (top)
    if (config.title.show) {
        const h = 30;
        available.y += h;
        available.height -= h;
    }

    // Legend
    if (config.legend.show) {
        const position = config.legend.position;
        const size = (position === "top" || position === "bottom") ? 30 : 80;

        if (position === "top") {
            available.y += size;
            available.height -= size;
        } else if (position === "bottom") {
            available.height -= size;
        } else if (position === "left") {
            available.x += size;
            available.width -= size;
        } else { // right
            available.width -= size;
        }
    }

    // Comment box (always right)
    if (config.commentBox.show && config.hasComments) {
        const w = 220;
        available.width -= w;
    }

    return available;
}

/**
 * Calculate the layout for a single cell in the small multiples grid.
 * Returns the cell's position and internal margins that account for
 * category label rotation, ensuring content fits within the cell.
 */
export function calculateCellLayout(
    grid: SmallMultiplesGrid,
    cellIndex: number,
    config: SmallMultiplesConfig
): SmallMultiplesCellLayout {
    const col = cellIndex % grid.cols;
    const row = Math.floor(cellIndex / grid.cols);
    const x = config.spacing + col * (grid.cellWidth + config.spacing);
    const y = config.spacing + row * (grid.cellHeight + config.spacing);
    const headerHeight = config.showHeaders ? 20 : 0;

    // Calculate bottom margin dynamically based on category rotation
    const rot = Math.abs(config.categoryRotation);
    let bottomMargin: number;
    if (rot === 0) {
        bottomMargin = 20 + config.categoryFontSize;
    } else {
        // Rotated labels need more space, but cap relative to cell height
        const rotatedHeight = Math.min(config.categoryMaxWidth, 100) * Math.sin(rot * Math.PI / 180);
        bottomMargin = 15 + rotatedHeight;
    }

    // Scale margins to fit within the cell — ensure at least 30% of cell for chart content
    const availHeight = grid.cellHeight - headerHeight;
    const sidePad = Math.min(45, Math.floor(grid.cellWidth * 0.15));
    const topMargin = 10;

    // Clamp bottom margin if it would leave less than 30% for chart
    const maxBottomMargin = Math.floor(availHeight * 0.4);
    bottomMargin = Math.min(bottomMargin, maxBottomMargin);

    const margin: Margins = {
        top: topMargin,
        right: sidePad,
        bottom: bottomMargin,
        left: sidePad,
    };

    const chartWidth = grid.cellWidth - margin.left - margin.right;
    const chartHeight = availHeight - margin.top - margin.bottom;

    return { x, y, margin, headerHeight, chartWidth, chartHeight };
}

