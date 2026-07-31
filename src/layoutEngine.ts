/**
 * Layout Engine - finite, nonnegative chart layout calculations
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

function finiteNonnegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function takeTop(available: Rect, requested: number): Rect | null {
    const height = Math.min(finiteNonnegative(requested), available.height);
    if (height <= 0 || available.width <= 0) return null;
    const area = { x: available.x, y: available.y, width: available.width, height };
    available.y += height;
    available.height -= height;
    return area;
}

function takeBottom(available: Rect, requested: number): Rect | null {
    const height = Math.min(finiteNonnegative(requested), available.height);
    if (height <= 0 || available.width <= 0) return null;
    const area = {
        x: available.x,
        y: available.y + available.height - height,
        width: available.width,
        height
    };
    available.height -= height;
    return area;
}

function takeLeft(available: Rect, requested: number): Rect | null {
    const width = Math.min(finiteNonnegative(requested), available.width);
    if (width <= 0 || available.height <= 0) return null;
    const area = { x: available.x, y: available.y, width, height: available.height };
    available.x += width;
    available.width -= width;
    return area;
}

function takeRight(available: Rect, requested: number): Rect | null {
    const width = Math.min(finiteNonnegative(requested), available.width);
    if (width <= 0 || available.height <= 0) return null;
    const area = {
        x: available.x + available.width - width,
        y: available.y,
        width,
        height: available.height
    };
    available.width -= width;
    return area;
}

function carvePeripherals(width: number, height: number, config: LayoutConfig): ChartLayout {
    const available: Rect = { x: 0, y: 0, width, height };
    const layout: ChartLayout = { chartArea: { ...available } };
    if (config.title.show) {
        const title = takeTop(available, 30);
        if (title) layout.titleArea = title;
    }
    if (config.legend.show) {
        const horizontal = config.legend.position === "top" || config.legend.position === "bottom";
        const size = horizontal ? 30 : 80;
        const legend = config.legend.position === "top"
            ? takeTop(available, size)
            : config.legend.position === "bottom"
                ? takeBottom(available, size)
                : config.legend.position === "left"
                    ? takeLeft(available, size)
                    : takeRight(available, size);
        if (legend) layout.legendArea = legend;
    }
    if (config.commentBox.show && config.hasComments) {
        const comments = takeRight(available, 220);
        if (comments) layout.commentBoxArea = comments;
    }
    layout.chartArea = { ...available };
    return layout;
}

function fitMargins(width: number, height: number, margins: Margins): Margins {
    const result = {
        top: finiteNonnegative(margins.top),
        right: finiteNonnegative(margins.right),
        bottom: finiteNonnegative(margins.bottom),
        left: finiteNonnegative(margins.left)
    };
    const horizontal = result.left + result.right;
    const horizontalLimit = width > 0 ? Math.max(0, width - 1) : 0;
    if (horizontal > horizontalLimit && horizontal > 0) {
        const scale = horizontalLimit / horizontal;
        result.left *= scale;
        result.right *= scale;
    }
    const vertical = result.top + result.bottom;
    const verticalLimit = height > 0 ? Math.max(0, height - 1) : 0;
    if (vertical > verticalLimit && vertical > 0) {
        const scale = verticalLimit / vertical;
        result.top *= scale;
        result.bottom *= scale;
    }
    return result;
}

export function calculateLayout(rawWidth: number, rawHeight: number, config: LayoutConfig): LayoutDimensions {
    const width = finiteNonnegative(rawWidth);
    const height = finiteNonnegative(rawHeight);
    if (config.breakpoint === "small") {
        const horizontalCategoryMargin = config.chartType === "bar" || config.chartType === "lollipop"
            ? Math.max(35, finiteNonnegative(config.categories.maxWidth) + 12)
            : 35;
        return {
            width,
            height,
            margin: fitMargins(width, height, { top: 5, right: 15, bottom: 25, left: horizontalCategoryMargin }),
            layout: { chartArea: { x: 0, y: 0, width, height } }
        };
    }

    const layout = carvePeripherals(width, height, config);
    const available = layout.chartArea;
    let axisBottom = 60;
    if (config.categories.show) {
        const rotation = Math.abs(Number.isFinite(config.categories.rotation) ? config.categories.rotation : 0);
        if (rotation === 0) {
            axisBottom = 30 + finiteNonnegative(config.categories.fontSize) * 2;
        } else {
            const maxWidth = Math.min(finiteNonnegative(config.categories.maxWidth), 150);
            axisBottom = 40 + maxWidth * Math.sin(rotation * Math.PI / 180);
        }
    }
    if (config.chartType === "waterfall") axisBottom += 20;

    const axes: Margins = { top: 30, right: 30, bottom: axisBottom, left: 60 };
    if (config.breakpoint === "medium") {
        axes.top = 20;
        axes.bottom = Math.min(axisBottom, 60);
        axes.left = 50;
    }
    if (config.chartType === "bar" || config.chartType === "lollipop") {
        axes.left = Math.max(axes.left, finiteNonnegative(config.categories.maxWidth) + 12);
    }

    const margins = fitMargins(width, height, {
        top: available.y + axes.top,
        left: available.x + axes.left,
        right: width - (available.x + available.width) + axes.right,
        bottom: height - (available.y + available.height) + axes.bottom
    });
    return { width, height, margin: margins, layout };
}

export function getChartArea(dims: LayoutDimensions): { chartWidth: number; chartHeight: number } {
    const width = finiteNonnegative(dims.width);
    const height = finiteNonnegative(dims.height);
    return {
        chartWidth: Math.max(0, width - finiteNonnegative(dims.margin.left) - finiteNonnegative(dims.margin.right)),
        chartHeight: Math.max(0, height - finiteNonnegative(dims.margin.top) - finiteNonnegative(dims.margin.bottom))
    };
}

export function getCommentBoxPosition(
    dims: LayoutDimensions
): { x: number; y: number; boxWidth: number; boxHeight: number } | null {
    const allocation = dims.layout?.commentBoxArea;
    if (!allocation || allocation.width <= 0 || allocation.height <= 0) return null;
    return {
        x: allocation.x - finiteNonnegative(dims.margin.left) + 10,
        y: allocation.y - finiteNonnegative(dims.margin.top),
        boxWidth: Math.max(0, allocation.width - 20),
        boxHeight: allocation.height
    };
}

export function getLegendPosition(
    dims: LayoutDimensions,
    legendPosition: string,
    commentBoxOnRight: boolean,
    itemCount: number
): { x: number; y: number } {
    const { chartWidth, chartHeight } = getChartArea(dims);
    const count = finiteNonnegative(itemCount);
    const allocation = dims.layout?.legendArea;
    if (allocation) {
        const horizontal = legendPosition === "top" || legendPosition === "bottom";
        return {
            x: allocation.x - finiteNonnegative(dims.margin.left)
                + (horizontal ? Math.max(5, (allocation.width - count * 70) / 2) : 0),
            y: allocation.y - finiteNonnegative(dims.margin.top)
                + (horizontal ? Math.max(0, (allocation.height - 12) / 2) : 5)
        };
    }
    switch (legendPosition) {
        case "top": return { x: chartWidth / 2 - count * 35, y: -25 };
        case "bottom": return { x: chartWidth / 2 - count * 35, y: chartHeight + 30 };
        case "left": return { x: -finiteNonnegative(dims.margin.left) + 5, y: 0 };
        default: return { x: chartWidth + (commentBoxOnRight ? 220 : 0) + 10, y: 0 };
    }
}

export interface SmallMultiplesConfig {
    columns: number;
    spacing: number;
    showHeaders: boolean;
    categoryRotation: number;
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
    x: number;
    y: number;
    margin: Margins;
    headerHeight: number;
    chartWidth: number;
    chartHeight: number;
}

export function calculateSmallMultiplesGrid(
    rawWidth: number,
    rawHeight: number,
    rawGroupCount: number,
    config: SmallMultiplesConfig
): SmallMultiplesGrid {
    const totalWidth = finiteNonnegative(rawWidth);
    const totalHeight = finiteNonnegative(rawHeight);
    const groupCount = Math.max(0, Math.floor(finiteNonnegative(rawGroupCount)));
    if (groupCount === 0) return { cols: 0, rows: 0, cellWidth: 0, cellHeight: 0 };
    const spacing = finiteNonnegative(config.spacing);
    const requestedColumns = Math.floor(finiteNonnegative(config.columns));
    const cols = requestedColumns > 0
        ? Math.min(groupCount, requestedColumns)
        : Math.min(groupCount, Math.max(1, Math.floor(totalWidth / 250)));
    const rows = Math.ceil(groupCount / cols);
    const cellWidth = Math.max(0, Math.floor((totalWidth - 10 - spacing * (cols + 1)) / cols));
    const cellHeight = Math.max(0, Math.floor((totalHeight - spacing * (rows + 1)) / rows));
    return { cols, rows, cellWidth, cellHeight };
}

export function getSmallMultiplesViewport(
    rawWidth: number,
    rawHeight: number,
    config: LayoutConfig
): Rect {
    return carvePeripherals(finiteNonnegative(rawWidth), finiteNonnegative(rawHeight), config).chartArea;
}

export function calculateCellLayout(
    grid: SmallMultiplesGrid,
    cellIndex: number,
    config: SmallMultiplesConfig
): SmallMultiplesCellLayout {
    const cols = Math.max(0, Math.floor(finiteNonnegative(grid.cols)));
    const cellWidth = finiteNonnegative(grid.cellWidth);
    const cellHeight = finiteNonnegative(grid.cellHeight);
    if (cols === 0 || cellWidth === 0 || cellHeight === 0) {
        return {
            x: 0, y: 0,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            headerHeight: 0, chartWidth: 0, chartHeight: 0
        };
    }
    const index = Math.max(0, Math.floor(finiteNonnegative(cellIndex)));
    const spacing = finiteNonnegative(config.spacing);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = spacing + col * (cellWidth + spacing);
    const y = spacing + row * (cellHeight + spacing);
    const headerHeight = config.showHeaders ? Math.min(20, cellHeight) : 0;
    const availableHeight = Math.max(0, cellHeight - headerHeight);
    const rotation = Math.abs(Number.isFinite(config.categoryRotation) ? config.categoryRotation : 0);
    const desiredBottom = rotation === 0
        ? 20 + finiteNonnegative(config.categoryFontSize)
        : 15 + Math.min(finiteNonnegative(config.categoryMaxWidth), 100) * Math.sin(rotation * Math.PI / 180);
    const bottom = Math.min(desiredBottom, Math.floor(availableHeight * 0.4));
    const top = Math.min(10, Math.max(0, availableHeight - bottom));
    const side = Math.min(45, Math.floor(cellWidth * 0.15), cellWidth / 2);
    const margin = { top, right: side, bottom, left: side };
    return {
        x,
        y,
        margin,
        headerHeight,
        chartWidth: Math.max(0, cellWidth - side * 2),
        chartHeight: Math.max(0, availableHeight - top - bottom)
    };
}
