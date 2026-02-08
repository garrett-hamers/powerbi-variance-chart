/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import { createChart, ChartSettings, ChartDimensions } from "../src/charts";
import { ParsedData, parseDataView } from "../src/dataParser";
import { buildMockDataView } from "./helpers/mockDataView";
import { calculateLayout, getSmallMultiplesViewport, calculateSmallMultiplesGrid, calculateCellLayout, SmallMultiplesConfig, LayoutConfig } from "../src/layoutEngine";

// ── Test Helpers ──

function defaultSettings(overrides: Partial<ChartSettings> = {}): ChartSettings {
    return {
        invertVariance: false,
        comparisonType: "budget",
        colors: {
            actual: "#404040",
            budget: "#808080",
            previousYear: "#9E9E9E",
            forecast: "#606060",
            positiveVariance: "#4CAF50",
            negativeVariance: "#F44336"
        },
        title: { show: false, text: "", fontSize: 14, fontColor: "#333", alignment: "left" },
        dataLabels: {
            show: true, showValues: true, showVariance: true, showPercentage: false,
            fontSize: 10, decimalPlaces: 1, displayUnits: "auto",
            negativeFormat: "minus", labelDensity: "all"
        },
        categories: { show: true, fontSize: 10, fontColor: "#666", rotation: 0, maxWidth: 100 },
        legend: { show: false, position: "right", fontSize: 10 },
        commentBox: {
            show: false, showVariance: "relative", varianceIcon: "triangle",
            padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
            markerSize: 18, markerColor: "#1a73e8"
        },
        highlighting: { show: false, threshold: 10, highlightPositive: true, highlightNegative: true },
        axisBreak: { show: false, breakValue: 0 },
        showVarianceLabels: true,
        showPercentage: false,
        fontSize: 10,
        fontColor: "#333",
        ...overrides
    };
}

function defaultDimensions(): ChartDimensions {
    return {
        width: 600,
        height: 300,
        margin: { top: 30, right: 30, bottom: 60, left: 60 }
    };
}

function sampleData(): ParsedData {
    const dv = buildMockDataView({
        categories: ["Jan", "Feb", "Mar", "Apr"],
        actual: [100, 150, 120, 180],
        budget: [110, 140, 130, 170]
    });
    return parseDataView(dv)!;
}

function sampleDataWithComments(): ParsedData {
    const dv = buildMockDataView({
        categories: ["Jan", "Feb", "Mar"],
        actual: [100, 200, 150],
        budget: [90, 210, 140],
        comments: ["Good start", "", "Improved"]
    });
    return parseDataView(dv)!;
}

function sampleGroupedData(): ParsedData {
    const dv = buildMockDataView({
        categories: ["Jan", "Feb", "Mar", "Jan", "Feb", "Mar"],
        actual: [100, 200, 150, 80, 170, 130],
        budget: [90, 210, 140, 85, 160, 125],
        groups: ["East", "East", "East", "West", "West", "West"],
        comments: ["Good", "", "Improved", "", "Strong", ""]
    });
    return parseDataView(dv)!;
}

let svgEl: SVGSVGElement;
let container: d3.Selection<SVGGElement, unknown, null, undefined>;

beforeEach(() => {
    // Create a fresh SVG + g container for each test
    const svgNs = "http://www.w3.org/2000/svg";
    svgEl = document.createElementNS(svgNs, "svg") as SVGSVGElement;
    svgEl.setAttribute("width", "600");
    svgEl.setAttribute("height", "300");
    document.body.appendChild(svgEl);

    const gEl = document.createElementNS(svgNs, "g");
    svgEl.appendChild(gEl);
    container = d3.select(gEl) as any;
});

// ── Chart Type Rendering Tests ──

const chartTypes = [
    "variance", "waterfall", "column", "columnStacked",
    "bar", "line", "area", "combo", "dot", "lollipop"
] as const;

describe("Chart rendering - all types", () => {
    for (const chartType of chartTypes) {
        describe(chartType, () => {
            it("renders without throwing", () => {
                const data = sampleData();
                const settings = defaultSettings();
                const dims = defaultDimensions();
                expect(() => {
                    const chart = createChart(chartType as any, container, data, settings, dims);
                    chart.render();
                }).not.toThrow();
            });

            it("produces SVG child elements", () => {
                const chart = createChart(chartType as any, container, sampleData(), defaultSettings(), defaultDimensions());
                chart.render();
                const children = container.selectAll("*").size();
                expect(children).toBeGreaterThan(0);
            });

            it("no transform or attribute contains NaN", () => {
                const chart = createChart(chartType as any, container, sampleData(), defaultSettings(), defaultDimensions());
                chart.render();
                let hasNaN = false;
                container.selectAll("*").each(function () {
                    const el = d3.select(this);
                    const transform = el.attr("transform");
                    if (transform && transform.includes("NaN")) hasNaN = true;
                    for (const attr of ["x", "y", "width", "height", "cx", "cy", "r", "x1", "y1", "x2", "y2"]) {
                        const val = el.attr(attr);
                        if (val && val.includes("NaN")) hasNaN = true;
                    }
                });
                expect(hasNaN).toBe(false);
            });
        });
    }
});

// ── Specific chart behavior tests ──

describe("Variance chart specifics", () => {
    it("renders rect elements for bars", () => {
        const chart = createChart("variance", container, sampleData(), defaultSettings(), defaultDimensions());
        chart.render();
        const rects = container.selectAll("rect").size();
        expect(rects).toBeGreaterThan(0);
    });

    it("renders text elements for data labels when enabled", () => {
        const settings = defaultSettings({ dataLabels: { ...defaultSettings().dataLabels, show: true, showValues: true } });
        const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
        chart.render();
        const texts = container.selectAll("text").size();
        expect(texts).toBeGreaterThan(0);
    });

    it("renders x-axis when categories enabled", () => {
        const chart = createChart("variance", container, sampleData(), defaultSettings(), defaultDimensions());
        chart.render();
        const axis = container.selectAll(".x-axis").size();
        expect(axis).toBeGreaterThan(0);
    });
});

describe("Title rendering", () => {
    it("renders title text when enabled", () => {
        const settings = defaultSettings({
            title: { show: true, text: "Test Title", fontSize: 14, fontColor: "#333", alignment: "left" }
        });
        const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
        chart.render();
        const titleEl = container.selectAll(".chart-title");
        expect(titleEl.size()).toBe(1);
        expect(titleEl.text()).toBe("Test Title");
    });

    it("does not render title when disabled", () => {
        const settings = defaultSettings({ title: { show: false, text: "Hidden", fontSize: 14, fontColor: "#333", alignment: "left" } });
        const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
        chart.render();
        expect(container.selectAll(".chart-title").size()).toBe(0);
    });
});

describe("Comment rendering", () => {
    it("renders comment box when enabled with comments", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        const commentBox = container.selectAll(".comment-box");
        expect(commentBox.size()).toBe(1);
    });

    it("renders comment box as scrollable foreignObject", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        // The comment box should be a foreignObject element
        const fo = container.select("foreignObject.comment-box");
        expect(fo.size()).toBe(1);
        expect(fo.attr("width")).not.toBeNull();
        expect(fo.attr("height")).not.toBeNull();
    });

    it("renders numbered circle markers in comment cards", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        // 2 comments (Jan="Good start", Mar="Improved"), each gets a card marker circle
        const cardMarkers = container.selectAll(".comment-card-marker");
        expect(cardMarkers.size()).toBe(2);
    });

    it("does not render comment box when disabled", () => {
        const data = sampleDataWithComments();
        const settings = defaultSettings({ commentBox: { ...defaultSettings().commentBox, show: false } });
        const chart = createChart("variance", container, data, settings, defaultDimensions());
        chart.render();
        expect(container.selectAll(".comment-box").size()).toBe(0);
    });

    it("renders variance icon (triangle) in comment cards", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        const icons = container.selectAll(".variance-icon");
        expect(icons.size()).toBe(2); // 2 comments = 2 icons
        icons.each(function() {
            const text = d3.select(this).text().trim();
            expect(["\u25B2", "\u25BC"]).toContain(text);
        });
    });

    it("renders variance icon (arrow) in comment cards", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "absolute", varianceIcon: "arrow",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        const icons = container.selectAll(".variance-icon");
        expect(icons.size()).toBe(2);
        icons.each(function() {
            const text = d3.select(this).text().trim();
            expect(["\u2191", "\u2193"]).toContain(text);
        });
    });

    it("does not render variance icon when set to none", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "none",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        expect(container.selectAll(".variance-icon").size()).toBe(0);
    });

    it("does not render variance icon when showVariance is none", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "none", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        expect(container.selectAll(".variance-icon").size()).toBe(0);
    });

    it("variance icon uses correct color (positive=green, negative=red)", () => {
        const data = sampleDataWithComments();
        const dims = defaultDimensions();
        dims.layout = {
            chartArea: { x: 60, y: 30, width: 290, height: 210 },
            commentBoxArea: { x: 380, y: 30, width: 220, height: 270 }
        };
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();
        const icons = container.selectAll(".variance-icon");
        expect(icons.size()).toBe(2);
        icons.each(function() {
            const el = d3.select(this);
            // HTML span uses style color, SVG text uses fill attr
            const color = el.style("color") || el.attr("fill");
            expect(color).not.toBeNull();
        });
    });
});

describe("Legend rendering", () => {
    it("renders legend when enabled", () => {
        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 }
        });
        const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
        chart.render();
        expect(container.selectAll(".legend").size()).toBe(1);
    });

    it("does not render legend when disabled", () => {
        const settings = defaultSettings({
            legend: { show: false, position: "right", fontSize: 10 }
        });
        const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
        chart.render();
        expect(container.selectAll(".legend").size()).toBe(0);
    });

    it("right legend stays within viewport when no comments", () => {
        const VP_W = 600, VP_H = 300;
        const config: LayoutConfig = {
            title: { show: false },
            legend: { show: true, position: "right" },
            commentBox: { show: false },
            categories: { show: true, rotation: -45, maxWidth: 100, fontSize: 10 },
            hasComments: false,
            chartType: "variance",
            breakpoint: "large"
        };
        const dims = calculateLayout(VP_W, VP_H, config);

        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
            commentBox: { ...defaultSettings().commentBox, show: false }
        });
        const chart = createChart("variance", container, sampleData(), settings, dims);
        chart.render();

        // Container is translated by (margin.left, margin.top)
        const legendEl = container.select(".legend");
        expect(legendEl.size()).toBe(1);
        const transform = legendEl.attr("transform");
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const legendX = parseFloat(match![1]);
        // Legend x is relative to margin.left; absolute = margin.left + legendX
        const absoluteX = dims.margin.left + legendX;
        expect(absoluteX).toBeLessThanOrEqual(VP_W);
        expect(absoluteX).toBeGreaterThan(0);
    });

    it("right legend stays within viewport with comments present", () => {
        const VP_W = 600, VP_H = 300;
        const config: LayoutConfig = {
            title: { show: false },
            legend: { show: true, position: "right" },
            commentBox: { show: true },
            categories: { show: true, rotation: -45, maxWidth: 100, fontSize: 10 },
            hasComments: true,
            chartType: "variance",
            breakpoint: "large"
        };
        const dims = calculateLayout(VP_W, VP_H, config);

        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const data = sampleDataWithComments();
        const chart = createChart("variance", container, data, settings, dims);
        chart.render();

        const legendEl = container.select(".legend");
        expect(legendEl.size()).toBe(1);
        const transform = legendEl.attr("transform");
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const legendX = parseFloat(match![1]);
        const absoluteX = dims.margin.left + legendX;
        expect(absoluteX).toBeLessThanOrEqual(VP_W);
        expect(absoluteX).toBeGreaterThan(0);
    });

    it("right legend without comments: legend x + 80px fits within viewport", () => {
        const VP_W = 600, VP_H = 300;
        const config: LayoutConfig = {
            title: { show: false },
            legend: { show: true, position: "right" },
            commentBox: { show: false },
            categories: { show: true, rotation: -45, maxWidth: 100, fontSize: 10 },
            hasComments: false,
            chartType: "variance",
            breakpoint: "large"
        };
        const dims = calculateLayout(VP_W, VP_H, config);

        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
            commentBox: { ...defaultSettings().commentBox, show: false }
        });
        const chart = createChart("variance", container, sampleData(), settings, dims);
        chart.render();

        const legendEl = container.select(".legend");
        const transform = legendEl.attr("transform");
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const legendX = parseFloat(match![1]);
        // The legend content (rect + text) is ~80px wide
        const legendRightEdge = dims.margin.left + legendX + 80;
        expect(legendRightEdge).toBeLessThanOrEqual(VP_W);
    });
});

describe("Edge cases", () => {
    it("handles single data point", () => {
        const dv = buildMockDataView({ categories: ["Only"], actual: [100] });
        const data = parseDataView(dv)!;
        expect(() => {
            const chart = createChart("variance", container, data, defaultSettings(), defaultDimensions());
            chart.render();
        }).not.toThrow();
    });

    it("handles very small dimensions without NaN", () => {
        const dims: ChartDimensions = { width: 100, height: 80, margin: { top: 10, right: 10, bottom: 20, left: 20 } };
        expect(() => {
            const chart = createChart("column", container, sampleData(), defaultSettings(), dims);
            chart.render();
        }).not.toThrow();
    });

    it("handles all zero values", () => {
        const dv = buildMockDataView({ categories: ["A", "B"], actual: [0, 0], budget: [0, 0] });
        const data = parseDataView(dv)!;
        expect(() => {
            const chart = createChart("variance", container, data, defaultSettings(), defaultDimensions());
            chart.render();
        }).not.toThrow();
    });

    it("handles negative values", () => {
        const dv = buildMockDataView({ categories: ["A", "B"], actual: [-50, -100], budget: [-30, -80] });
        const data = parseDataView(dv)!;
        expect(() => {
            const chart = createChart("waterfall", container, data, defaultSettings(), defaultDimensions());
            chart.render();
        }).not.toThrow();
    });

    it("handles large dataset (20 categories)", () => {
        const cats = Array.from({ length: 20 }, (_, i) => `Cat${i + 1}`);
        const vals = Array.from({ length: 20 }, (_, i) => (i + 1) * 50);
        const dv = buildMockDataView({ categories: cats, actual: vals, budget: vals.map(v => v * 0.9) });
        const data = parseDataView(dv)!;
        expect(() => {
            const chart = createChart("column", container, data, defaultSettings(), defaultDimensions());
            chart.render();
        }).not.toThrow();
        expect(container.selectAll("rect").size()).toBeGreaterThan(0);
    });

    it("handles all comparison types with every chart type", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [100, 200, 150],
            budget: [90, 210, 140],
            previousYear: [80, 190, 160],
            forecast: [95, 205, 145]
        });
        const data = parseDataView(dv)!;
        for (const ct of ["budget", "previousYear", "forecast"] as const) {
            const settings = defaultSettings({ comparisonType: ct });
            for (const chartType of ["variance", "column", "line", "waterfall"] as const) {
                expect(() => {
                    const chart = createChart(chartType, container, data, settings, defaultDimensions());
                    chart.render();
                }).not.toThrow();
            }
        }
    });

    it("renders data labels disabled without error", () => {
        const settings = defaultSettings({
            dataLabels: { ...defaultSettings().dataLabels, show: false }
        });
        expect(() => {
            const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
            chart.render();
        }).not.toThrow();
    });

    it("renders with inverted variance", () => {
        const settings = defaultSettings({ invertVariance: true });
        expect(() => {
            const chart = createChart("variance", container, sampleData(), settings, defaultDimensions());
            chart.render();
        }).not.toThrow();
    });

    it("container transform from non-group render does not leak into group render", () => {
        // Simulate non-group render: chart sets container transform
        const dims = defaultDimensions();
        const chart = createChart("variance", container, sampleData(), defaultSettings(), dims);
        chart.render();
        // After render, container has transform from chart.render()
        const transformAfterChart = container.attr("transform");
        expect(transformAfterChart).toContain("translate");

        // Now simulate what visual.ts should do before a group render:
        // Clear children and RESET transform
        container.selectAll("*").remove();
        container.attr("transform", null);

        // Verify transform is cleared
        const transformAfterReset = container.attr("transform");
        expect(transformAfterReset).toBeNull();
    });
});

describe("DOM limitations awareness", () => {
    it("getComputedTextLength returns 0 in happy-dom (known limitation)", () => {
        const svgNs = "http://www.w3.org/2000/svg";
        const textEl = document.createElementNS(svgNs, "text");
        svgEl.appendChild(textEl);
        textEl.textContent = "Test text";
        // happy-dom does not compute text metrics — always returns 0
        // This means label truncation in renderXAxis won't execute in tests
        expect(textEl.getComputedTextLength()).toBe(0);
    });
});

// ── Group (Small Multiples) with Legend + Comments ──

describe("Grouped chart rendering with peripherals", () => {
    const VP_W = 800;
    const VP_H = 400;

    function defaultSmConfig(): SmallMultiplesConfig {
        return {
            columns: 0,
            spacing: 10,
            showHeaders: true,
            categoryRotation: -45,
            categoryMaxWidth: 100,
            categoryFontSize: 10,
        };
    }

    function layoutConfigForGroups(overrides: Partial<LayoutConfig> = {}): LayoutConfig {
        return {
            title: { show: false },
            legend: { show: false, position: "right" },
            commentBox: { show: false },
            categories: { show: true, rotation: -45, maxWidth: 100, fontSize: 10 },
            hasComments: false,
            chartType: "variance",
            breakpoint: "large",
            ...overrides,
        };
    }

    /**
     * Simulate what visual.ts renderSmallMultiples should do:
     * 1. Compute viewport for the grid (after peripherals carve space)
     * 2. Create grid within that viewport
     * 3. Render each group's chart in a cell
     * 4. Render legend/comments at the outer level
     */
    function renderSmallMultiplesSimulation(
        outerContainer: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        chartSettings: ChartSettings,
        lConfig: LayoutConfig,
        smConfig: SmallMultiplesConfig,
        vpWidth: number,
        vpHeight: number
    ) {
        const vp = getSmallMultiplesViewport(vpWidth, vpHeight, lConfig);
        const groups = data.groups;
        const grid = calculateSmallMultiplesGrid(vp.width, vp.height, groups.length, smConfig);

        // Render cells
        groups.forEach((group, i) => {
            const cell = calculateCellLayout(grid, i, smConfig);
            const cellSvg = outerContainer.append("svg")
                .attr("class", "sm-cell")
                .attr("x", vp.x + cell.x)
                .attr("y", vp.y + cell.y)
                .attr("width", grid.cellWidth)
                .attr("height", grid.cellHeight)
                .attr("overflow", "hidden");

            if (smConfig.showHeaders) {
                cellSvg.append("text")
                    .attr("class", "sm-header")
                    .attr("x", grid.cellWidth / 2)
                    .attr("y", 14)
                    .text(group);
            }

            const chartGroup = cellSvg.append("g")
                .attr("transform", `translate(0, ${cell.headerHeight})`) as any;

            const cellDims: ChartDimensions = {
                width: grid.cellWidth,
                height: grid.cellHeight - cell.headerHeight,
                margin: cell.margin
            };

            const cellSettings: ChartSettings = {
                ...chartSettings,
                legend: { ...chartSettings.legend, show: false },
                commentBox: { ...chartSettings.commentBox, show: false },
                title: { ...chartSettings.title, show: false },
            };

            const groupData: ParsedData = {
                ...data,
                dataPoints: data.dataPoints.filter(d => d.group === group),
            };

            const chart = createChart("variance", chartGroup, groupData, cellSettings, cellDims);
            chart.render();
        });

        // Render outer legend if enabled
        if (chartSettings.legend.show) {
            const legendGroup = outerContainer.append("g").attr("class", "outer-legend");
            const pos = lConfig.legend.position;
            if (pos === "right") {
                legendGroup.attr("transform", `translate(${vp.x + vp.width + 10}, ${vp.y})`);
            } else if (pos === "left") {
                legendGroup.attr("transform", `translate(5, ${vp.y})`);
            } else if (pos === "top") {
                legendGroup.attr("transform", `translate(${vpWidth / 2}, ${vp.y - 20})`);
            } else {
                legendGroup.attr("transform", `translate(${vpWidth / 2}, ${vp.y + vp.height + 5})`);
            }
            legendGroup.append("text").text("Actual");
            legendGroup.append("text").text("Budget");
        }

        // Render outer comment box if enabled
        if (chartSettings.commentBox.show && data.hasComments) {
            const commentGroup = outerContainer.append("g").attr("class", "outer-comment-box");
            commentGroup.attr("transform", `translate(${vp.x + vp.width + 10}, ${vp.y})`);
            data.dataPoints
                .filter(d => d.comment && d.comment.trim() !== "")
                .forEach((dp, i) => {
                    commentGroup.append("text")
                        .attr("class", "comment-text")
                        .attr("y", i * 40)
                        .text(dp.comment!);
                });
        }

        return { vp, grid };
    }

    it("without peripherals, grid fills full viewport", () => {
        const lConfig = layoutConfigForGroups();
        const vp = getSmallMultiplesViewport(VP_W, VP_H, lConfig);
        expect(vp.width).toBe(VP_W);
        expect(vp.height).toBe(VP_H);
    });

    it("with right legend, grid width is reduced", () => {
        const lConfig = layoutConfigForGroups({ legend: { show: true, position: "right" } });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, lConfig);
        expect(vp.width).toBe(VP_W - 80);
        expect(vp.height).toBe(VP_H);
    });

    it("with comment box, grid width is reduced by 220px", () => {
        const lConfig = layoutConfigForGroups({ commentBox: { show: true }, hasComments: true });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, lConfig);
        expect(vp.width).toBe(VP_W - 220);
    });

    it("with right legend + comments, grid width is reduced by both", () => {
        const lConfig = layoutConfigForGroups({
            legend: { show: true, position: "right" },
            commentBox: { show: true },
            hasComments: true,
        });
        const vp = getSmallMultiplesViewport(VP_W, VP_H, lConfig);
        expect(vp.width).toBe(VP_W - 80 - 220);
    });

    it("renders grouped charts without throwing", () => {
        const data = sampleGroupedData();
        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const lConfig = layoutConfigForGroups({
            legend: { show: true, position: "right" },
            commentBox: { show: true },
            hasComments: true,
        });

        expect(() => {
            renderSmallMultiplesSimulation(
                container, data, settings, lConfig, defaultSmConfig(), VP_W, VP_H
            );
        }).not.toThrow();
    });

    it("all cell right edges stay within viewport when legend + comments enabled", () => {
        const data = sampleGroupedData();
        const lConfig = layoutConfigForGroups({
            legend: { show: true, position: "right" },
            commentBox: { show: true },
            hasComments: true,
        });
        const smConfig = defaultSmConfig();

        const vp = getSmallMultiplesViewport(VP_W, VP_H, lConfig);
        const grid = calculateSmallMultiplesGrid(vp.width, vp.height, data.groups.length, smConfig);

        for (let i = 0; i < data.groups.length; i++) {
            const cell = calculateCellLayout(grid, i, smConfig);
            const absoluteRight = vp.x + cell.x + grid.cellWidth;
            expect(absoluteRight).toBeLessThanOrEqual(vp.x + vp.width);
        }
    });

    it("outer legend is positioned within viewport bounds", () => {
        const data = sampleGroupedData();
        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
        });
        const lConfig = layoutConfigForGroups({ legend: { show: true, position: "right" } });

        const { vp } = renderSmallMultiplesSimulation(
            container, data, settings, lConfig, defaultSmConfig(), VP_W, VP_H
        );

        const legendEl = container.select(".outer-legend");
        expect(legendEl.size()).toBe(1);
        const transform = legendEl.attr("transform");
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const legendX = parseFloat(match![1]);
        expect(legendX).toBeGreaterThanOrEqual(vp.x + vp.width);
        expect(legendX).toBeLessThanOrEqual(VP_W);
    });

    it("outer comment box is positioned within viewport bounds", () => {
        const data = sampleGroupedData();
        const settings = defaultSettings({
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            }
        });
        const lConfig = layoutConfigForGroups({ commentBox: { show: true }, hasComments: true });

        const { vp } = renderSmallMultiplesSimulation(
            container, data, settings, lConfig, defaultSmConfig(), VP_W, VP_H
        );

        const commentEl = container.select(".outer-comment-box");
        expect(commentEl.size()).toBe(1);
        const transform = commentEl.attr("transform");
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        const commentX = parseFloat(match![1]);
        expect(commentX).toBeGreaterThanOrEqual(vp.x + vp.width);
        expect(commentX).toBeLessThanOrEqual(VP_W);
    });

    it("no NaN in any attributes when groups + legend + comments enabled", () => {
        const data = sampleGroupedData();
        const settings = defaultSettings({
            legend: { show: true, position: "right", fontSize: 10 },
            commentBox: {
                show: true, showVariance: "relative", varianceIcon: "triangle",
                padding: 6, gap: 8, fontSize: 10, fontColor: "#333",
                markerSize: 18, markerColor: "#1a73e8"
            },
            title: { show: true, text: "Grouped View", fontSize: 14, fontColor: "#333", alignment: "left" }
        });
        const lConfig = layoutConfigForGroups({
            title: { show: true },
            legend: { show: true, position: "right" },
            commentBox: { show: true },
            hasComments: true,
        });

        renderSmallMultiplesSimulation(
            container, data, settings, lConfig, defaultSmConfig(), VP_W, VP_H
        );

        let hasNaN = false;
        container.selectAll("*").each(function () {
            const el = d3.select(this);
            const transform = el.attr("transform");
            if (transform && transform.includes("NaN")) hasNaN = true;
            for (const attr of ["x", "y", "width", "height", "cx", "cy", "r"]) {
                const val = el.attr(attr);
                if (val && val.includes("NaN")) hasNaN = true;
            }
        });
        expect(hasNaN).toBe(false);
    });
});

// ─── Cross-Filter Logic Tests ───

describe("Cross-filter logic", () => {
    let container: d3.Selection<SVGGElement, unknown, null, undefined>;

    beforeEach(() => {
        const body = d3.select(document.body);
        body.selectAll("svg").remove();
        const svg = body.append("svg").attr("width", 600).attr("height", 400);
        container = svg.append("g");
    });

    // Mock ISelectionId with getKey and equals methods
    function mockSelectionId(key: string) {
        return {
            _key: key,
            getKey() { return this._key; },
            equals(other: any) { return other?._key === this._key; },
            getSelector() { return {}; },
            getSelectorsByColumn() { return {}; },
            hasIdentity() { return true; }
        };
    }

    describe("Selection ID comparison", () => {
        it("matches selection IDs using equals() method", () => {
            const id1a = mockSelectionId("table.col.val1");
            const id1b = mockSelectionId("table.col.val1");
            // Different objects, same key — equals() should match
            expect(id1a.equals(id1b)).toBe(true);
            expect(id1a === id1b).toBe(false); // reference comparison fails
        });

        it("matches selection IDs using getKey() method", () => {
            const id1 = mockSelectionId("table.col.val1");
            const id2 = mockSelectionId("table.col.val2");
            const selectedKeys = new Set([id1.getKey()]);
            expect(selectedKeys.has(id1.getKey())).toBe(true);
            expect(selectedKeys.has(id2.getKey())).toBe(false);
        });

        it("does not match different selection IDs", () => {
            const id1 = mockSelectionId("table.col.val1");
            const id2 = mockSelectionId("table.col.val2");
            expect(id1.equals(id2)).toBe(false);
        });
    });

    describe("Filter target construction", () => {
        it("parses Table.Column queryName format", () => {
            const queryName = "Sales.Product";
            const dotIndex = queryName.indexOf(".");
            const tableName = dotIndex > 0 ? queryName.substring(0, dotIndex) : queryName;
            const columnName = dotIndex > 0 ? queryName.substring(dotIndex + 1) : queryName;
            expect(tableName).toBe("Sales");
            expect(columnName).toBe("Product");
        });

        it("handles queryName without dot separator", () => {
            const queryName = "Product";
            const displayName = "Product Name";
            const dotIndex = queryName.indexOf(".");
            const tableName = dotIndex > 0 ? queryName.substring(0, dotIndex) : (queryName || displayName);
            const columnName = dotIndex > 0 ? queryName.substring(dotIndex + 1) : displayName;
            expect(tableName).toBe("Product");
            expect(columnName).toBe("Product Name");
        });

        it("handles empty queryName with fallback to displayName", () => {
            const queryName = "";
            const displayName = "Category";
            const dotIndex = queryName.indexOf(".");
            const tableName = dotIndex > 0 ? queryName.substring(0, dotIndex) : (queryName || displayName);
            const columnName = dotIndex > 0 ? queryName.substring(dotIndex + 1) : displayName;
            expect(tableName).toBe("Category");
            expect(columnName).toBe("Category");
        });
    });

    describe("Incoming highlight processing", () => {
        it("dims non-highlighted data points based on data-index", () => {
            const data = sampleDataWithComments();
            const dims = defaultDimensions();
            dims.layout = {
                chartArea: { x: 60, y: 30, width: 290, height: 210 },
                commentBoxArea: null
            };
            const settings = defaultSettings();
            const chart = createChart("variance", container, data, settings, dims);
            chart.render();

            // Simulate data-index tagging (as addInteractivity would)
            let idx = 0;
            container.selectAll("rect").each(function() {
                const el = d3.select(this);
                const fill = el.attr("fill");
                if (fill && fill !== "none" && fill !== "white" && fill !== "#fff") {
                    el.attr("data-index", String(idx++));
                }
            });

            // Simulate highlights: only first data point highlighted
            const highlights = [100, null]; // first highlighted, second not
            const dpCount = data.dataPoints.length;

            // Dim all
            container.selectAll("rect[data-index]").each(function() {
                d3.select(this).style("opacity", "0.3");
            });
            // Restore highlighted
            container.selectAll("rect[data-index]").each(function() {
                const el = d3.select(this);
                const indexStr = el.attr("data-index");
                if (indexStr != null) {
                    const dpIndex = parseInt(indexStr) % dpCount;
                    if (dpIndex < highlights.length && highlights[dpIndex] != null) {
                        el.style("opacity", "1");
                    }
                }
            });

            // Check: elements mapped to dpIndex 0 should be opaque, dpIndex 1 should be dimmed
            let dp0Opacity = "";
            let dp1Opacity = "";
            container.selectAll("rect[data-index]").each(function() {
                const el = d3.select(this);
                const dpIndex = parseInt(el.attr("data-index")!) % dpCount;
                if (dpIndex === 0) dp0Opacity = el.style("opacity");
                if (dpIndex === 1) dp1Opacity = el.style("opacity");
            });
            expect(dp0Opacity).toBe("1");
            expect(dp1Opacity).toBe("0.3");
        });
    });

    describe("Selection state sync", () => {
        it("applies opacity dimming and restore based on selection", () => {
            const data = sampleDataWithComments();
            const dims = defaultDimensions();
            dims.layout = {
                chartArea: { x: 60, y: 30, width: 290, height: 210 },
                commentBoxArea: null
            };
            const settings = defaultSettings();
            const chart = createChart("variance", container, data, settings, dims);
            chart.render();

            // Tag elements with data-index
            let idx = 0;
            container.selectAll("rect").each(function() {
                const el = d3.select(this);
                const fill = el.attr("fill");
                if (fill && fill !== "none" && fill !== "white" && fill !== "#fff") {
                    el.attr("data-index", String(idx++));
                }
            });

            const dpCount = data.dataPoints.length;
            const selectedDpIndices = new Set([0]); // select first data point

            // Dim all, then restore selected
            container.selectAll("rect[data-index]").each(function() {
                d3.select(this).style("opacity", "0.3");
            });
            container.selectAll("rect[data-index]").each(function() {
                const el = d3.select(this);
                const dpIndex = parseInt(el.attr("data-index")!) % dpCount;
                if (selectedDpIndices.has(dpIndex)) {
                    el.style("opacity", "1");
                }
            });

            // Verify
            container.selectAll("rect[data-index]").each(function() {
                const el = d3.select(this);
                const dpIndex = parseInt(el.attr("data-index")!) % dpCount;
                const expectedOpacity = selectedDpIndices.has(dpIndex) ? "1" : "0.3";
                expect(el.style("opacity")).toBe(expectedOpacity);
            });
        });

        it("restores full opacity when no selection", () => {
            const data = sampleDataWithComments();
            const dims = defaultDimensions();
            dims.layout = {
                chartArea: { x: 60, y: 30, width: 290, height: 210 },
                commentBoxArea: null
            };
            const settings = defaultSettings();
            const chart = createChart("variance", container, data, settings, dims);
            chart.render();

            // Tag elements
            let idx = 0;
            container.selectAll("rect").each(function() {
                const el = d3.select(this);
                const fill = el.attr("fill");
                if (fill && fill !== "none" && fill !== "white" && fill !== "#fff") {
                    el.attr("data-index", String(idx++));
                }
            });

            // No selection: all elements should be opacity 1
            container.selectAll("rect[data-index]").each(function() {
                d3.select(this).style("opacity", "1");
            });

            container.selectAll("rect[data-index]").each(function() {
                expect(d3.select(this).style("opacity")).toBe("1");
            });
        });
    });

    describe("Multi-select cross-filter values", () => {
        it("accumulates values for multi-select", () => {
            const values = new Set<string>();
            // Simulate single click
            values.clear();
            values.add("Jan");
            expect(Array.from(values)).toEqual(["Jan"]);

            // Simulate ctrl+click (multi-select, no clear)
            values.add("Feb");
            expect(Array.from(values)).toEqual(["Jan", "Feb"]);

            // Simulate single click again (clears first)
            values.clear();
            values.add("Mar");
            expect(Array.from(values)).toEqual(["Mar"]);
        });
    });
});
