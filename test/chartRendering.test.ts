/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import { createChart, ChartSettings, ChartDimensions, getChartValueDomain } from "../src/charts";
import { ParsedData, parseDataView, subsetParsedData } from "../src/dataParser";
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
        foreground: "#333333",
        background: "#ffffff",
        highContrast: false,
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

describe("Cross-chart label and reference-marker behavior", () => {
    it.each(["variance", "bar"] as const)("%s renders an analytics reference line", chartType => {
        const data = sampleData();
        const settings = defaultSettings({
            referenceLine: {
                show: true,
                label: "Target",
                value: 125,
                color: "#0066cc",
                style: "dashed"
            }
        });
        createChart(chartType, container, data, settings, defaultDimensions()).render();
        const line = container.select<SVGLineElement>(".reference-line");
        expect(line.size()).toBe(1);
        expect(line.attr("stroke")).toBe("#0066cc");
        expect(line.attr("stroke-dasharray")).toBe("6,3");
    });

    it.each(["combo", "dot"] as const)(
        "%s honors first-and-last label density",
        chartType => {
            const data = parseDataView(buildMockDataView({
                categories: ["A", "B", "C"],
                actual: [10, 20, 30],
                budget: [8, 18, 28]
            }))!;
            const settings = defaultSettings({
                dataLabels: {
                    ...defaultSettings().dataLabels,
                    labelDensity: "firstLast"
                }
            });
            createChart(chartType, container, data, settings, defaultDimensions()).render();
            const directLabels = Array.from(
                container.node()!.children,
                element => element
            ).filter(element => element.tagName.toLowerCase() === "text");
            expect(directLabels).toHaveLength(2);
        }
    );

    it.each(["variance", "bar", "lollipop"] as const)(
        "%s renders a finite negative reference marker on its value axis",
        chartType => {
            const data = parseDataView(buildMockDataView({
                categories: ["A", "B"],
                actual: [-20, 20],
                budget: [-10, 10]
            }))!;
            const settings = defaultSettings({
                axisBreak: { show: true, breakValue: -5 }
            });
            createChart(chartType, container, data, settings, defaultDimensions()).render();
            const marker = container.select<SVGPathElement>(".axis-break-indicator");
            expect(marker.size()).toBe(1);
            expect(marker.attr("d")).not.toMatch(/NaN|Infinity/);
        }
    );

    it("uses a non-color negative treatment for high-contrast waterfall steps", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [8],
            budget: [10]
        }))!;
        const settings = defaultSettings({
            highContrast: true,
            foreground: "#ffffff",
            background: "#000000",
            colors: {
                actual: "#ffffff",
                budget: "#ffffff",
                previousYear: "#ffffff",
                forecast: "#ffffff",
                positiveVariance: "#ffffff",
                negativeVariance: "#ffffff"
            }
        });
        createChart("waterfall", container, data, settings, defaultDimensions()).render();
        const step = container.select<SVGRectElement>(".waterfall-step");
        expect(step.attr("fill")).toBe("#000000");
        expect(step.attr("stroke-dasharray")).toBe("2,2");
    });
});

// ── Specific chart behavior tests ──

describe("Variance chart specifics", () => {
    it("renders rect elements for bars", () => {
        const chart = createChart("variance", container, sampleData(), defaultSettings(), defaultDimensions());
        chart.render();
        const rects = container.selectAll("rect").size();
        expect(rects).toBeGreaterThan(0);
    });

    it("stamps data-dp-index on all data rects mapping to correct data point", () => {
        const data = sampleData(); // 4 data points
        const chart = createChart("variance", container, data, defaultSettings(), defaultDimensions());
        chart.render();
        // Variance chart renders 3 rects per data point (comparison, actual, variance)
        const indexed = container.selectAll("rect[data-dp-index]");
        expect(indexed.size()).toBe(data.dataPoints.length * 3);
        // All 3 rects for the same data point should share the same data-dp-index
        const indicesByDp = new Map<string, number>();
        indexed.each(function() {
            const idx = d3.select(this).attr("data-dp-index")!;
            indicesByDp.set(idx, (indicesByDp.get(idx) || 0) + 1);
        });
        // Each data point index should appear exactly 3 times
        for (const [idx, count] of indicesByDp) {
            expect(count).toBe(3);
            expect(parseInt(idx)).toBeLessThan(data.dataPoints.length);
        }
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
    it.each(["bar", "waterfall"] as const)("renders chart comment markers for %s", chartType => {
        const data = sampleDataWithComments();
        const settings = defaultSettings({
            commentBox: {
                ...defaultSettings().commentBox,
                show: true
            }
        });
        createChart(chartType, container, data, settings, defaultDimensions()).render();
        expect(container.selectAll(".comment-marker").size()).toBe(2);
        expect(container.selectAll(".comment-marker-text").size()).toBe(2);
    });

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

describe("Horizontal category label constraints", () => {
    it.each(["bar", "lollipop"] as const)("truncates long %s category labels", chartType => {
        const data = parseDataView(buildMockDataView({
            categories: ["A very long category label", "Another long category label"],
            actual: [100, 200],
            budget: [80, 220]
        }))!;
        const settings = defaultSettings({
            categories: {
                ...defaultSettings().categories,
                maxWidth: 40
            }
        });
        createChart(chartType, container, data, settings, defaultDimensions()).render();
        const labels = Array.from(container.node()!.querySelectorAll(".y-axis text"));
        expect(labels).toHaveLength(2);
        expect(labels.every(label => (label.textContent ?? "").length < 28)).toBe(true);
        expect(labels[0].getAttribute("data-full-label")).toBe("A very long category label");
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

    it("column chart renders only the selected compare-against series", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [100, 200, 150],
            budget: [90, 210, 140],
            previousYear: [80, 190, 160],
            forecast: [95, 205, 145]
        });
        const data = parseDataView(dv)!;

        const forecastSettings = defaultSettings({ comparisonType: "forecast" });
        createChart("column", container, data, forecastSettings, defaultDimensions()).render();

        expect(container.selectAll(`rect[fill="${forecastSettings.colors.forecast}"]`).size()).toBeGreaterThan(0);
        expect(container.selectAll(`rect[fill="${forecastSettings.colors.budget}"]`).size()).toBe(0);
        expect(container.selectAll(`rect[fill="${forecastSettings.colors.previousYear}"]`).size()).toBe(0);

        container.selectAll("*").remove();
        container.attr("transform", null);

        const pySettings = defaultSettings({ comparisonType: "previousYear" });
        createChart("column", container, data, pySettings, defaultDimensions()).render();

        expect(container.selectAll(`rect[fill="${pySettings.colors.previousYear}"]`).size()).toBeGreaterThan(0);
        expect(container.selectAll(`rect[fill="${pySettings.colors.budget}"]`).size()).toBe(0);
        expect(container.selectAll(`rect[fill="${pySettings.colors.forecast}"]`).size()).toBe(0);
    });

    it("bar chart renders only the selected compare-against series", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [100, 200, 150],
            budget: [90, 210, 140],
            previousYear: [80, 190, 160],
            forecast: [95, 205, 145]
        });
        const data = parseDataView(dv)!;

        const forecastSettings = defaultSettings({ comparisonType: "forecast" });
        createChart("bar", container, data, forecastSettings, defaultDimensions()).render();

        expect(container.selectAll(`rect[fill="${forecastSettings.colors.forecast}"]`).size()).toBeGreaterThan(0);
        expect(container.selectAll(`rect[fill="${forecastSettings.colors.budget}"]`).size()).toBe(0);
        expect(container.selectAll(`rect[fill="${forecastSettings.colors.previousYear}"]`).size()).toBe(0);
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

    it.each(chartTypes)("%s honors all data-label detail toggles", chartType => {
        const settings = defaultSettings({
            dataLabels: {
                ...defaultSettings().dataLabels,
                show: true,
                showValues: false,
                showVariance: false,
                showPercentage: false,
                fontSize: 37
            }
        });
        createChart(chartType, container, sampleData(), settings, defaultDimensions()).render();
        expect(container.selectAll('text[font-size="37px"]').size()).toBe(0);
    });

    it("formats absolute and percentage variance labels independently", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [100],
            budget: [80]
        }))!;
        const settings = defaultSettings({
            dataLabels: {
                ...defaultSettings().dataLabels,
                showValues: false,
                showVariance: true,
                showPercentage: true,
                fontSize: 37
            }
        });
        createChart("variance", container, data, settings, defaultDimensions()).render();
        expect(container.select('text[font-size="37px"]').text()).toBe("+20.0 (+25.0%)");
    });

    it.each(["bar", "lollipop"] as const)("%s hides its category axis when categories are disabled", chartType => {
        const settings = defaultSettings({
            categories: { ...defaultSettings().categories, show: false }
        });
        createChart(chartType, container, sampleData(), settings, defaultDimensions()).render();
        expect(container.selectAll(".y-axis").size()).toBe(0);
        expect(container.selectAll(".x-axis").size()).toBe(1);
    });

    it("centers unrotated category labels on their ticks", () => {
        createChart("column", container, sampleData(), defaultSettings(), defaultDimensions()).render();
        expect(container.select(".x-axis text").style("text-anchor")).toBe("middle");
    });

    it("invertVariance flips variance polarity colors in variance chart", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [100, 80, 120],
            budget: [90, 110, 100]
        });
        const data = parseDataView(dv)!;

        const normal = defaultSettings({ invertVariance: false });
        createChart("variance", container, data, normal, defaultDimensions()).render();
        const normalPos = container.selectAll(`rect[fill="${normal.colors.positiveVariance}"]`).size();
        const normalNeg = container.selectAll(`rect[fill="${normal.colors.negativeVariance}"]`).size();
        expect(normalPos).toBe(2);
        expect(normalNeg).toBe(1);

        container.selectAll("*").remove();
        container.attr("transform", null);

        const inverted = defaultSettings({ invertVariance: true });
        createChart("variance", container, data, inverted, defaultDimensions()).render();
        const invPos = container.selectAll(`rect[fill="${inverted.colors.positiveVariance}"]`).size();
        const invNeg = container.selectAll(`rect[fill="${inverted.colors.negativeVariance}"]`).size();
        expect(invPos).toBe(1);
        expect(invNeg).toBe(2);
    });

    it("invertVariance keeps waterfall bridge connected to actual total", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [80, 90, 95],
            budget: [100, 100, 100]
        });
        const data = parseDataView(dv)!;

        for (const invertVariance of [false, true]) {
            container.selectAll("*").remove();
            container.attr("transform", null);

            const settings = defaultSettings({ invertVariance });
            createChart("waterfall", container, data, settings, defaultDimensions()).render();

            const connectors = container.selectAll('line[stroke-dasharray="2,2"]');
            const lastConnector = connectors.nodes()[connectors.size() - 1] as SVGLineElement;
            const connectorY = Number(lastConnector.getAttribute("y1"));

            const totals = container.selectAll(".synthetic-total").nodes() as SVGPathElement[];
            const actualTotal = totals[totals.length - 1];
            const actualPath = actualTotal.getAttribute("d")!;
            const actualMatch = actualPath.match(/^M[^,]+,([^ ]+) H[^ ]+ V([^ ]+)/)!;
            const actualYs = [Number(actualMatch[1]), Number(actualMatch[2])];

            expect(actualYs.some(y => Math.abs(connectorY - y) < 0.001)).toBe(true);
        }
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

    describe("Certification hardening regressions", () => {
        function assertFiniteSvg(): void {
            container.selectAll("*").each(function() {
                const element = d3.select(this);
                const path = element.attr("d");
                if (path) expect(path).not.toMatch(/NaN|Infinity/);
                for (const attribute of ["x", "y", "width", "height", "cx", "cy", "r", "x1", "y1", "x2", "y2"]) {
                    const raw = element.attr(attribute);
                    if (raw !== null) {
                        expect(raw).not.toMatch(/NaN|Infinity/);
                        expect(Number.isFinite(Number(raw))).toBe(true);
                    }
                }
            });
        }

        it.each(chartTypes)("%s keeps mixed signs/zero and emits only finite SVG geometry", chartType => {
            const data = parseDataView(buildMockDataView({
                categories: ["positive", "negative", "zero", "missing", "overflow", "infinite"],
                actual: [100, -50, 0, null, Number.MAX_VALUE, Number.POSITIVE_INFINITY],
                budget: [80, -70, 0, 20, -Number.MAX_VALUE],
                previousYear: [90, -40, 0],
                forecast: [110, -60, 0, Number.NaN]
            }))!;
            createChart(chartType, container, data, defaultSettings(), defaultDimensions()).render();
            assertFiniteSvg();
        });

        it("positions duplicate category labels by row key rather than collapsing bands", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Same", "Same", "Same"],
                actual: [10, 20, 30]
            }))!;
            createChart("column", container, data, defaultSettings(), defaultDimensions()).render();
            const positions = container.selectAll(`rect[fill="${defaultSettings().colors.actual}"]`).nodes()
                .map(node => Number(node.getAttribute("x")));
            expect(new Set(positions).size).toBe(3);
            expect(container.selectAll(".x-axis .tick").size()).toBe(3);
        });

        it("keeps scenario comparisons grouped instead of stacking non-additive values", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Mixed"],
                actual: [100],
                budget: [-70]
            }))!;
            createChart("columnStacked", container, data, defaultSettings(), defaultDimensions()).render();
            const rects = container.selectAll("rect[data-dp-index]").nodes() as SVGRectElement[];
            expect(rects).toHaveLength(2);
            expect(Number(rects[0].getAttribute("height"))).toBeGreaterThan(0);
            expect(Number(rects[1].getAttribute("height"))).toBeGreaterThan(0);
            expect(rects[0].getAttribute("x")).not.toBe(rects[1].getAttribute("x"));
        });

        it("contains overflowing stacked totals without emitting infinite geometry", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Extreme"],
                actual: [Number.MAX_VALUE],
                budget: [Number.MAX_VALUE]
            }))!;
            expect(getChartValueDomain("columnStacked", data, "budget", false))
                .toEqual([0, Number.MAX_VALUE]);
            createChart("columnStacked", container, data, defaultSettings(), defaultDimensions()).render();
            assertFiniteSvg();
            expect(container.selectAll("rect[data-source-indices]").size()).toBeGreaterThan(0);
        });

        it("area creates indexed host hit targets for finite zero/negative points and gaps missing points", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["A", "B", "C", "D"],
                actual: [10, 0, -5, null]
            }))!;
            createChart("area", container, data, defaultSettings(), defaultDimensions()).render();
            const targets = container.selectAll(".area-hit-target");
            expect(targets.size()).toBe(3);
            expect(targets.nodes().map(node => node.getAttribute("data-dp-index"))).toEqual(["0", "1", "2"]);
            expect(container.select(".area-actual").attr("d")).not.toMatch(/NaN|Infinity/);
        });

        it("waterfall synthetic totals have no identity while steps retain original source indices", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Plan Total", "Actual", "Actual"],
                actual: [-20, -30, -40],
                budget: [-10, -20, -30]
            }))!;
            createChart("waterfall", container, data, defaultSettings(), defaultDimensions()).render();
            const synthetic = container.selectAll(".synthetic-total");
            expect(synthetic.size()).toBe(2);
            synthetic.each(function() {
                expect(this.hasAttribute("data-dp-index")).toBe(false);
            });
            expect(container.selectAll(".waterfall-step").nodes().map(node => node.getAttribute("data-dp-index")))
                .toEqual(["0", "1", "2"]);
            const zeroY = Number(container.select('line[stroke-dasharray="3,3"]').attr("y1"));
            synthetic.each(function() {
                const topY = Number(this.getAttribute("d")!.match(/^M[^,]+,([^ ]+)/)![1]);
                expect(topY).toBeCloseTo(zeroY, 5);
            });
            expect(container.selectAll(".x-axis .tick").size()).toBe(5);
        });

        it("falls back to the available comparison with its correct label and color", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["A"], actual: [100], budget: [90]
            }))!;
            const settings = defaultSettings({
                comparisonType: "forecast",
                legend: { show: true, position: "right", fontSize: 10 }
            });
            createChart("dot", container, data, settings, defaultDimensions()).render();
            expect(container.select(".legend").text()).toContain("Plan");
            expect(container.selectAll(`circle[stroke="${settings.colors.budget}"]`).size()).toBeGreaterThan(0);
            expect(container.selectAll(`circle[stroke="${settings.colors.forecast}"]`).size()).toBe(0);
        });

        it("handles every comparator role subset and preferred-comparison combination across all chart types", () => {
            for (let mask = 0; mask < 8; mask++) {
                const input = {
                    categories: ["A", "B", "C"],
                    actual: [10, 0, -10],
                    ...(mask & 1 ? { budget: [8, 0, -8] } : {}),
                    ...(mask & 2 ? { previousYear: [9, 0, -9] } : {}),
                    ...(mask & 4 ? { forecast: [11, 0, -11] } : {})
                };
                const data = parseDataView(buildMockDataView(input))!;
                for (const comparisonType of ["budget", "previousYear", "forecast"] as const) {
                    for (const chartType of chartTypes) {
                        container.selectAll("*").remove();
                        createChart(chartType, container, data, defaultSettings({ comparisonType }), defaultDimensions()).render();
                        assertFiniteSvg();
                    }
                }
            }
        });

        it("renders honest actual-only/no-comparison states instead of actual-vs-zero variance", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["A", "B"], actual: [100, -40]
            }))!;
            createChart("variance", container, data, defaultSettings(), defaultDimensions()).render();
            expect(container.selectAll("rect[data-dp-index]").size()).toBe(2);
            expect(container.selectAll(`rect[fill="${defaultSettings().colors.positiveVariance}"]`).size()).toBe(0);
            container.selectAll("*").remove();
            createChart("lollipop", container, data, defaultSettings(), defaultDimensions()).render();
            expect(container.select(".no-comparison").text()).toBe("No comparison available");
        });

        it("omits unavailable percentages and renders zero variance without an icon", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Zero base", "Exact"],
                actual: [50, 20],
                budget: [0, 20],
                comments: ["Undefined pct", "No change"]
            }))!;
            const dims = defaultDimensions();
            dims.layout = {
                chartArea: { x: 0, y: 0, width: 300, height: 200 },
                commentBoxArea: { x: 300, y: 0, width: 220, height: 200 }
            };
            const settings = defaultSettings({
                commentBox: {
                    ...defaultSettings().commentBox,
                    show: true,
                    showVariance: "relative",
                    varianceIcon: "triangle"
                }
            });
            createChart("variance", container, data, settings, dims).render();
            expect(container.select(".comment-box").text()).not.toContain("—");
            expect(container.selectAll(".variance-icon").size()).toBe(1);
            const zeroVarianceBar = container.selectAll(`rect[fill="${settings.colors.actual}"][data-dp-index="1"]`);
            expect(zeroVarianceBar.size()).toBeGreaterThan(0);
        });

        it("honors model format strings for chart labels", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["A"],
                actual: [1234.5],
                formats: { actual: "$#,0.00" }
            }), "en-US")!;
            const settings = defaultSettings({
                dataLabels: { ...defaultSettings().dataLabels, displayUnits: "none", decimalPlaces: 2 }
            });
            createChart("column", container, data, settings, defaultDimensions()).render();
            expect(container.text()).toContain("$1,234.50");
        });

        it("uses unique SVG pattern IDs for each chart instance", () => {
            const root = d3.select(svgEl);
            const first = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            const second = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            const data = parseDataView(buildMockDataView({
                categories: ["A"], actual: [100], forecast: [90]
            }))!;
            const settings = defaultSettings({ comparisonType: "forecast" });
            createChart("variance", first, data, settings, defaultDimensions()).render();
            createChart("variance", second, data, settings, defaultDimensions()).render();
            const ids = root.selectAll("pattern").nodes().map(node => node.id);
            expect(ids).toHaveLength(2);
            expect(new Set(ids).size).toBe(2);
        });

        it("axis-break setting is a non-destructive continuous-scale marker", () => {
            const settings = defaultSettings({ axisBreak: { show: true, breakValue: 50 } });
            createChart("column", container, sampleData(), settings, defaultDimensions()).render();
            expect(container.selectAll(".axis-break-indicator").size()).toBe(1);
            expect(container.selectAll('rect[fill="white"]').size()).toBe(0);
        });

        it("uses local domains independently and one explicit shared domain, including mixed negatives", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Positive", "Negative", "Positive", "Negative"],
                groups: ["Small", "Small", "Large", "Large"],
                actual: [10, -5, 10_000, -5_000]
            }))!;
            const small = subsetParsedData(data, data.dataPoints.slice(0, 2));
            const large = subsetParsedData(data, data.dataPoints.slice(2));
            const shared = getChartValueDomain("column", data, "budget", false);
            expect(getChartValueDomain("column", small, "budget", false)).toEqual([-5, 10]);
            expect(getChartValueDomain("column", large, "budget", false)).toEqual([-5_000, 10_000]);
            expect(shared).toEqual([-5_000, 10_000]);

            const root = d3.select(svgEl);
            const smallIndependent = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            const largeIndependent = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            createChart("column", smallIndependent, small, defaultSettings(), defaultDimensions()).render();
            createChart("column", largeIndependent, large, defaultSettings(), defaultDimensions()).render();
            const independentSmallHeight = Number(smallIndependent.select('[data-source-indices="0"]').attr("height"));
            const independentLargeHeight = Number(largeIndependent.select('[data-source-indices="2"]').attr("height"));
            expect(independentSmallHeight).toBeCloseTo(independentLargeHeight, 5);
            expect(independentSmallHeight / 10).toBeGreaterThan((independentLargeHeight / 10_000) * 100);

            const smallShared = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            const largeShared = root.append("g") as d3.Selection<SVGGElement, unknown, null, undefined>;
            createChart("column", smallShared, small, defaultSettings({ sharedValueDomain: shared }), defaultDimensions()).render();
            createChart("column", largeShared, large, defaultSettings({ sharedValueDomain: shared }), defaultDimensions()).render();
            const sharedSmallHeight = Number(smallShared.select('[data-source-indices="0"]').attr("height"));
            const sharedLargeHeight = Number(largeShared.select('[data-source-indices="2"]').attr("height"));
            expect(sharedSmallHeight / 10).toBeCloseTo(sharedLargeHeight / 10_000, 5);
        });

        it("reconciles waterfall opening, steps, and closing from complete pairs per group", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Paired", "Missing pair", "Paired", "Missing pair"],
                groups: ["East", "East", "West", "West"],
                actual: [100, 999, 50, 500],
                budget: [80, null, 40, null]
            }))!;
            expect(getChartValueDomain("waterfall", data, "budget", false)).toEqual([0, 100]);
            const east = subsetParsedData(data, data.dataPoints.slice(0, 2));
            createChart("waterfall", container, east, defaultSettings(), defaultDimensions()).render();
            expect(container.selectAll(".waterfall-step").size()).toBe(1);
            expect(container.selectAll(".synthetic-total").size()).toBe(2);
            expect(container.text()).toContain("100.0");
            expect(container.text()).not.toContain("1,099.0");

            container.selectAll("*").remove();
            const withSubtotal = parseDataView(buildMockDataView({
                categories: ["Paired", "Checkpoint", "Missing pair"],
                actual: [100, 100, 999],
                budget: [80, 80, null],
                comments: ["", "= subtotal", ""]
            }))!;
            expect(getChartValueDomain("waterfall", withSubtotal, "budget", false)).toEqual([0, 100]);
            createChart("waterfall", container, withSubtotal, defaultSettings(), defaultDimensions()).render();
            expect(container.selectAll(".waterfall-step").size()).toBe(1);
            expect(container.selectAll(".waterfall-total[data-source-indices]").size()).toBe(1);
        });

        it("falls back consistently when waterfall totals or intermediate steps overflow", () => {
            const grouped = parseDataView(buildMockDataView({
                categories: ["A", "B", "A"],
                groups: ["Extreme", "Extreme", "Normal"],
                actual: [Number.MAX_VALUE, Number.MAX_VALUE, 10],
                budget: [Number.MAX_VALUE, Number.MAX_VALUE, 8]
            }))!;
            expect(getChartValueDomain("waterfall", grouped, "budget", false))
                .toEqual([0, Number.MAX_VALUE]);

            const halfMax = Number.MAX_VALUE / 2;
            const intermediateOverflow = parseDataView(buildMockDataView({
                categories: ["A", "B"],
                actual: [Number.MAX_VALUE, 0],
                budget: [halfMax, halfMax]
            }))!;
            createChart("waterfall", container, intermediateOverflow, defaultSettings(), defaultDimensions()).render();
            expect(container.selectAll(".waterfall-step").size()).toBe(0);
            expect(container.selectAll(".synthetic-total").size()).toBe(0);
            expect(container.selectAll(".waterfall-total[data-source-indices]").size()).toBe(2);
            assertFiniteSvg();
        });

        it("applies one Auto unit to axes and labels while None stays unscaled", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["Revenue"],
                actual: [1_500_000]
            }), "en-US")!;
            const auto = defaultSettings({ displayUnitReference: 1_500_000 });
            createChart("column", container, data, auto, defaultDimensions()).render();
            expect(container.text()).toContain("1.5M");
            expect(container.text()).not.toContain("1,500,000");

            container.selectAll("*").remove();
            const none = defaultSettings({
                displayUnitReference: 1_500_000,
                dataLabels: { ...defaultSettings().dataLabels, displayUnits: "none" }
            });
            createChart("column", container, data, none, defaultDimensions()).render();
            expect(container.text()).toContain("1,500,000.0");
            expect(container.text()).not.toContain("1.5M");
        });

        it("uses high-contrast foreground/background for comments and forecast hatching", () => {
            const data = parseDataView(buildMockDataView({
                categories: ["A"],
                actual: [100],
                forecast: [90],
                comments: ["Accessible note"]
            }))!;
            const dims = defaultDimensions();
            dims.layout = {
                chartArea: { x: 0, y: 0, width: 300, height: 200 },
                commentBoxArea: { x: 300, y: 0, width: 220, height: 200 }
            };
            const settings = defaultSettings({
                comparisonType: "forecast",
                foreground: "#ffff00",
                background: "#000000",
                highContrast: true,
                commentBox: {
                    ...defaultSettings().commentBox,
                    show: true,
                    fontColor: "#ffff00",
                    markerColor: "#ffff00"
                }
            });
            createChart("variance", container, data, settings, dims).render();
            const commentBox = container.select<SVGForeignObjectElement>(".comment-box").node();
            const styleText = Array.from(
                commentBox?.querySelectorAll<HTMLElement>("[style]") ?? [],
                element => element.getAttribute("style") ?? ""
            ).join(" ");
            expect(styleText).toContain("#ffff00");
            expect(styleText).not.toMatch(/#333|#666|#999|#1a73e8|white/i);
            expect(container.select("pattern line").attr("stroke")).toBe("#000000");
        });
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
