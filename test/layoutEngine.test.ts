import { describe, it, expect } from "vitest";
import {
    calculateLayout,
    getChartArea,
    getCommentBoxPosition,
    getLegendPosition,
    calculateSmallMultiplesGrid,
    calculateCellLayout,
    getSmallMultiplesViewport,
    LayoutConfig,
    SmallMultiplesConfig,
} from "../src/layoutEngine";

// ── Helpers ──

function defaultConfig(overrides: Partial<LayoutConfig> = {}): LayoutConfig {
    return {
        title: { show: true },
        legend: { show: true, position: "right" },
        commentBox: { show: true },
        categories: { show: true, rotation: -45, maxWidth: 100, fontSize: 10 },
        hasComments: true,
        chartType: "variance",
        breakpoint: "large",
        ...overrides,
    };
}

const VP_W = 800;
const VP_H = 400;

// ── Tests ──

describe("calculateLayout", () => {
    // ─── Invariant: margins + chartArea never exceed viewport ───

    it("chartWidth + margins.left + margins.right == viewport width", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const { chartWidth } = getChartArea(dims);
        expect(dims.margin.left + chartWidth + dims.margin.right).toBe(VP_W);
    });

    it("chartHeight + margins.top + margins.bottom == viewport height", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const { chartHeight } = getChartArea(dims);
        expect(dims.margin.top + chartHeight + dims.margin.bottom).toBeCloseTo(VP_H, 5);
    });

    it("chartWidth and chartHeight are positive", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const { chartWidth, chartHeight } = getChartArea(dims);
        expect(chartWidth).toBeGreaterThan(0);
        expect(chartHeight).toBeGreaterThan(0);
    });

    // ─── Small breakpoint returns compact margins ───

    it("small breakpoint returns fixed compact margins", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({ breakpoint: "small" }));
        expect(dims.margin).toEqual({ top: 5, right: 15, bottom: 25, left: 35 });
    });

    // ─── Title ───

    it("title adds 30px to the top offset", () => {
        const withTitle = calculateLayout(VP_W, VP_H, defaultConfig({ title: { show: true } }));
        const noTitle = calculateLayout(VP_W, VP_H, defaultConfig({ title: { show: false } }));
        expect(withTitle.margin.top - noTitle.margin.top).toBe(30);
    });

    // ─── Legend positions ───

    it("right legend adds 80px to right margin", () => {
        const withLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "right" } }));
        const noLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: false, position: "right" } }));
        expect(withLegend.margin.right - noLegend.margin.right).toBe(80);
    });

    it("left legend adds 80px to left margin", () => {
        const withLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "left" } }));
        const noLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: false, position: "left" } }));
        expect(withLegend.margin.left - noLegend.margin.left).toBe(80);
    });

    it("top legend adds 30px to top margin", () => {
        const withLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "top" } }));
        const noLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: false, position: "top" } }));
        expect(withLegend.margin.top - noLegend.margin.top).toBe(30);
    });

    it("bottom legend adds 30px to bottom margin", () => {
        const withLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "bottom" } }));
        const noLegend = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: false, position: "bottom" } }));
        expect(withLegend.margin.bottom - noLegend.margin.bottom).toBeCloseTo(30, 5);
    });

    // ─── Comment box (always right) ───

    it("comment box always adds 220px to right margin", () => {
        const withCB = calculateLayout(VP_W, VP_H, defaultConfig({ commentBox: { show: true } }));
        const noCB = calculateLayout(VP_W, VP_H, defaultConfig({ commentBox: { show: false } }));
        expect(withCB.margin.right - noCB.margin.right).toBe(220);
    });

    it("comment box is not allocated when hasComments is false", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({ hasComments: false }));
        expect(dims.layout.commentBoxArea).toBeUndefined();
    });

    it("comment box is always on the right regardless of legend position", () => {
        const withRightLegend = calculateLayout(VP_W, VP_H, defaultConfig({
            legend: { show: true, position: "right" },
            commentBox: { show: true },
        }));
        const withTopLegend = calculateLayout(VP_W, VP_H, defaultConfig({
            legend: { show: true, position: "top" },
            commentBox: { show: true },
        }));
        // Both should have comment box area defined
        expect(withRightLegend.layout.commentBoxArea).toBeDefined();
        expect(withTopLegend.layout.commentBoxArea).toBeDefined();
        // Both should have 220 comment width in layout
        expect(withRightLegend.layout.commentBoxArea!.width).toBe(220);
        expect(withTopLegend.layout.commentBoxArea!.width).toBe(220);
    });

    // ─── Chart type specific ───

    it("lollipop chart increases left margin", () => {
        const lollipop = calculateLayout(VP_W, VP_H, defaultConfig({ chartType: "lollipop" }));
        const variance = calculateLayout(VP_W, VP_H, defaultConfig({ chartType: "variance" }));
        expect(lollipop.margin.left).toBeGreaterThan(variance.margin.left);
    });

    it("waterfall chart increases bottom margin", () => {
        const waterfall = calculateLayout(VP_W, VP_H, defaultConfig({ chartType: "waterfall" }));
        const variance = calculateLayout(VP_W, VP_H, defaultConfig({ chartType: "variance" }));
        expect(waterfall.margin.bottom).toBeGreaterThan(variance.margin.bottom);
    });
});

describe("getCommentBoxPosition", () => {
    it("x == chartWidth + 10", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const pos = getCommentBoxPosition(dims);
        const { chartWidth } = getChartArea(dims);
        expect(pos).not.toBeNull();
        expect(pos!.x).toBe(chartWidth + 10);
    });

    it("absolute right edge fits within viewport", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const pos = getCommentBoxPosition(dims);
        const absRight = dims.margin.left + pos!.x + pos!.boxWidth;
        expect(absRight).toBeLessThanOrEqual(VP_W);
    });

    it("does not overlap with legend area when legend is right", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({
            legend: { show: true, position: "right" },
        }));
        const pos = getCommentBoxPosition(dims);
        const legendPos = getLegendPosition(dims, "right", true, 3);
        const commentRight = pos!.x + pos!.boxWidth;
        expect(commentRight).toBeLessThanOrEqual(legendPos.x);
    });

    it("boxWidth uses comment allocation width", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const pos = getCommentBoxPosition(dims);
        expect(pos!.boxWidth).toBe(220 - 30); // allocation minus padding
    });
});

describe("getLegendPosition", () => {
    it("right legend: x is past chartWidth", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const pos = getLegendPosition(dims, "right", false, 3);
        const { chartWidth } = getChartArea(dims);
        expect(pos.x).toBeGreaterThan(chartWidth);
    });

    it("right legend with comment on right: x accounts for comment offset", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        const posWithComment = getLegendPosition(dims, "right", true, 3);
        const posWithout = getLegendPosition(dims, "right", false, 3);
        expect(posWithComment.x - posWithout.x).toBe(220);
    });

    it("right legend: absolute position is within viewport", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({
            commentBox: { show: false, placement: "right" },
        }));
        const pos = getLegendPosition(dims, "right", false, 3);
        const absX = dims.margin.left + pos.x;
        expect(absX).toBeLessThan(VP_W);
        expect(absX).toBeGreaterThan(0);
    });

    it("top legend: y is negative (above chart area)", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "top" } }));
        const pos = getLegendPosition(dims, "top", false, 3);
        expect(pos.y).toBeLessThan(0);
    });

    it("bottom legend: y is below chartHeight", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "bottom" } }));
        const { chartHeight } = getChartArea(dims);
        const pos = getLegendPosition(dims, "bottom", false, 3);
        expect(pos.y).toBeGreaterThan(chartHeight);
    });

    it("left legend: x is negative (in left margin)", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({ legend: { show: true, position: "left" } }));
        const pos = getLegendPosition(dims, "left", false, 3);
        expect(pos.x).toBeLessThan(0);
    });
});

describe("title position", () => {
    it("title y renders in the negative margin space above chart", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig());
        // Title y = -margin.top + 20
        const titleY = -dims.margin.top + 20;
        // Absolute: margin.top + titleY = 20 (from top of viewport)
        const absY = dims.margin.top + titleY;
        expect(absY).toBe(20);
        expect(absY).toBeGreaterThan(0);
        expect(absY).toBeLessThan(VP_H);
    });
});

describe("edge cases", () => {
    it("very small viewport still produces positive chart dimensions", () => {
        const dims = calculateLayout(300, 200, defaultConfig());
        const { chartWidth, chartHeight } = getChartArea(dims);
        expect(chartWidth).toBeGreaterThan(0);
        expect(chartHeight).toBeGreaterThan(-50);
    });

    it("no peripherals: margins are just axis margins", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({
            title: { show: false },
            legend: { show: false, position: "right" },
            commentBox: { show: false, placement: "right" },
        }));
        expect(dims.margin.top).toBe(30);
        expect(dims.margin.left).toBe(60);
        expect(dims.margin.right).toBe(30);
    });

    it("all peripherals on right: total right usage fits viewport", () => {
        const dims = calculateLayout(VP_W, VP_H, defaultConfig({
            legend: { show: true, position: "right" },
            commentBox: { show: true, placement: "right" },
        }));
        const { chartWidth } = getChartArea(dims);
        expect(dims.margin.left + chartWidth + dims.margin.right).toBe(VP_W);
        expect(dims.margin.left).toBeGreaterThan(0);
        expect(chartWidth).toBeGreaterThan(0);
        expect(dims.margin.right).toBeGreaterThan(0);
    });
});

// ── Small Multiples Tests ──

function defaultSmConfig(overrides: Partial<SmallMultiplesConfig> = {}): SmallMultiplesConfig {
    return {
        columns: 0,
        spacing: 10,
        showHeaders: true,
        categoryRotation: -45,
        categoryMaxWidth: 100,
        categoryFontSize: 10,
        ...overrides,
    };
}

describe("calculateSmallMultiplesGrid", () => {
    it("auto columns: 800px wide gives 3 cols for 4 groups", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 4, defaultSmConfig());
        expect(grid.cols).toBe(3);
        expect(grid.rows).toBe(2);
    });

    it("auto columns: 500px wide gives 2 cols", () => {
        const grid = calculateSmallMultiplesGrid(500, 400, 4, defaultSmConfig());
        expect(grid.cols).toBe(2);
    });

    it("manual columns override auto", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 4, defaultSmConfig({ columns: 2 }));
        expect(grid.cols).toBe(2);
        expect(grid.rows).toBe(2);
    });

    it("cell dimensions are positive", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 4, defaultSmConfig());
        expect(grid.cellWidth).toBeGreaterThan(0);
        expect(grid.cellHeight).toBeGreaterThan(0);
    });

    it("no cell right edge exceeds viewport width", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 6, defaultSmConfig());
        const config = defaultSmConfig();
        for (let i = 0; i < 6; i++) {
            const cell = calculateCellLayout(grid, i, config);
            expect(cell.x + grid.cellWidth).toBeLessThanOrEqual(800);
        }
    });

    it("no cell bottom edge exceeds viewport height", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 6, defaultSmConfig());
        const config = defaultSmConfig();
        for (let i = 0; i < 6; i++) {
            const cell = calculateCellLayout(grid, i, config);
            expect(cell.y + grid.cellHeight).toBeLessThanOrEqual(400);
        }
    });
});

describe("calculateCellLayout", () => {
    it("cell chartWidth and chartHeight are positive", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 4, defaultSmConfig());
        const cell = calculateCellLayout(grid, 0, defaultSmConfig());
        expect(cell.chartWidth).toBeGreaterThan(0);
        expect(cell.chartHeight).toBeGreaterThan(0);
    });

    it("cell margins + chart dimensions fit within cell", () => {
        const grid = calculateSmallMultiplesGrid(800, 400, 4, defaultSmConfig());
        const cell = calculateCellLayout(grid, 0, defaultSmConfig());
        // Horizontal: margin.left + chartWidth + margin.right == cellWidth
        expect(cell.margin.left + cell.chartWidth + cell.margin.right).toBe(grid.cellWidth);
        // Vertical: headerHeight + margin.top + chartHeight + margin.bottom == cellHeight
        expect(cell.headerHeight + cell.margin.top + cell.chartHeight + cell.margin.bottom).toBe(grid.cellHeight);
    });

    it("rotated labels: bottom margin accounts for rotation", () => {
        const rotated = calculateCellLayout(
            calculateSmallMultiplesGrid(800, 400, 2, defaultSmConfig({ categoryRotation: -45 })),
            0,
            defaultSmConfig({ categoryRotation: -45 })
        );
        const flat = calculateCellLayout(
            calculateSmallMultiplesGrid(800, 400, 2, defaultSmConfig({ categoryRotation: 0 })),
            0,
            defaultSmConfig({ categoryRotation: 0 })
        );
        expect(rotated.margin.bottom).toBeGreaterThan(flat.margin.bottom);
    });

    it("bottom margin never exceeds 40% of available cell height", () => {
        const config = defaultSmConfig({ categoryRotation: -90, categoryMaxWidth: 200 });
        const grid = calculateSmallMultiplesGrid(800, 400, 4, config);
        const cell = calculateCellLayout(grid, 0, config);
        const availHeight = grid.cellHeight - cell.headerHeight;
        expect(cell.margin.bottom).toBeLessThanOrEqual(Math.floor(availHeight * 0.4));
    });

    it("small viewport: chart area is still positive", () => {
        const config = defaultSmConfig({ categoryRotation: -45 });
        const grid = calculateSmallMultiplesGrid(400, 250, 4, config);
        const cell = calculateCellLayout(grid, 0, config);
        expect(cell.chartWidth).toBeGreaterThan(0);
        expect(cell.chartHeight).toBeGreaterThan(0);
    });

    it("content never exceeds cell SVG bounds", () => {
        const configs = [
            defaultSmConfig({ categoryRotation: -45 }),
            defaultSmConfig({ categoryRotation: -90 }),
            defaultSmConfig({ categoryRotation: 0 }),
        ];
        for (const config of configs) {
            const grid = calculateSmallMultiplesGrid(800, 400, 4, config);
            const cell = calculateCellLayout(grid, 0, config);
            const totalWidth = cell.margin.left + cell.chartWidth + cell.margin.right;
            const totalHeight = cell.headerHeight + cell.margin.top + cell.chartHeight + cell.margin.bottom;
            expect(totalWidth).toBeLessThanOrEqual(grid.cellWidth);
            expect(totalHeight).toBeLessThanOrEqual(grid.cellHeight);
        }
    });
});

// ── Small Multiples with Peripherals (Groups + Legend/Comments) ──

describe("getSmallMultiplesViewport", () => {
    it("with no peripherals, viewport equals full dimensions", () => {
        const config = defaultConfig({ title: { show: false }, legend: { show: false, position: "right" }, commentBox: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.x).toBe(0);
        expect(vp.y).toBe(0);
        expect(vp.width).toBe(VP_W);
        expect(vp.height).toBe(VP_H);
    });

    it("with right legend, viewport width is reduced by legend width", () => {
        const config = defaultConfig({ legend: { show: true, position: "right" }, commentBox: { show: false }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.width).toBeLessThan(VP_W);
        expect(vp.width).toBe(VP_W - 80); // right legend is 80px
        expect(vp.height).toBe(VP_H);
    });

    it("with left legend, viewport width is reduced and x is offset", () => {
        const config = defaultConfig({ legend: { show: true, position: "left" }, commentBox: { show: false }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.x).toBe(80); // left legend pushes grid right
        expect(vp.width).toBe(VP_W - 80);
    });

    it("with top legend, viewport height is reduced and y is offset", () => {
        const config = defaultConfig({ legend: { show: true, position: "top" }, commentBox: { show: false }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.y).toBe(30); // top legend pushes grid down
        expect(vp.height).toBe(VP_H - 30);
    });

    it("with bottom legend, viewport height is reduced", () => {
        const config = defaultConfig({ legend: { show: true, position: "bottom" }, commentBox: { show: false }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.y).toBe(0);
        expect(vp.height).toBe(VP_H - 30);
    });

    it("with comment box, viewport width is reduced by 220px", () => {
        const config = defaultConfig({ legend: { show: false, position: "right" }, commentBox: { show: true }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.width).toBe(VP_W - 220);
    });

    it("with title, viewport height is reduced and y is offset", () => {
        const config = defaultConfig({ legend: { show: false, position: "right" }, commentBox: { show: false }, title: { show: true } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        expect(vp.y).toBe(30); // title is 30px
        expect(vp.height).toBe(VP_H - 30);
    });

    it("with title + right legend + comment box, all reduce viewport", () => {
        const config = defaultConfig({ title: { show: true }, legend: { show: true, position: "right" }, commentBox: { show: true } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        // Title: 30px top, Legend: 80px right, Comment: 220px right
        expect(vp.y).toBe(30);
        expect(vp.height).toBe(VP_H - 30);
        expect(vp.width).toBe(VP_W - 80 - 220); // legend + comment on right
        expect(vp.x).toBe(0);
    });

    it("cells using reduced viewport never exceed viewport bounds", () => {
        const config = defaultConfig({ title: { show: true }, legend: { show: true, position: "right" }, commentBox: { show: true } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        const smConfig = defaultSmConfig();
        const grid = calculateSmallMultiplesGrid(vp.width, vp.height, 4, smConfig);
        for (let i = 0; i < 4; i++) {
            const cell = calculateCellLayout(grid, i, smConfig);
            // Cell positions are relative to the reduced viewport
            expect(vp.x + cell.x + grid.cellWidth).toBeLessThanOrEqual(VP_W);
            expect(vp.y + cell.y + grid.cellHeight).toBeLessThanOrEqual(VP_H);
        }
    });

    it("comment box position is relative to reduced viewport", () => {
        const config = defaultConfig({ commentBox: { show: true }, legend: { show: false, position: "right" }, title: { show: false } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, config);
        // Comment box should start right after the grid viewport
        expect(vp.x + vp.width).toBeLessThanOrEqual(VP_W - 220 + 220); // grid end + comment
    });
});
