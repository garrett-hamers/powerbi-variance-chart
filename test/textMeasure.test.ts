/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import {
    DEFAULT_FONT_FAMILY,
    ELLIPSIS,
    measureTextWidth,
    resetTextMeasurementCache,
    resolveLabelCollisions,
    truncateToWidth
} from "../src/utils/textMeasure";
import { createChart, ChartSettings, ChartDimensions, ChartType } from "../src/charts";
import { ParsedData, parseDataView } from "../src/dataParser";
import { buildMockDataView } from "./helpers/mockDataView";

const STYLE = { fontSize: 10, fontFamily: DEFAULT_FONT_FAMILY };

function settings(overrides: Partial<ChartSettings> = {}): ChartSettings {
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
            fontSize: 10, decimalPlaces: 1, displayUnits: "none",
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

/** Narrow viewport + many categories so labels genuinely compete for space. */
function crowdedDimensions(): ChartDimensions {
    return { width: 260, height: 220, margin: { top: 10, right: 10, bottom: 30, left: 40 } };
}

function crowdedData(): ParsedData {
    const categories = Array.from({ length: 24 }, (_, i) => `Period ${i + 1}`);
    const actual = categories.map((_, i) => 1000 + i * 137);
    const budget = categories.map((_, i) => 1100 + i * 121);
    return parseDataView(buildMockDataView({ categories, actual, budget }))!;
}

function renderLabels(chartType: ChartType, density: "all" | "auto"): string[] {
    const container = d3.select(document.body).append("svg").append("g");
    const chart = createChart(
        chartType,
        container as d3.Selection<SVGGElement, unknown, null, undefined>,
        crowdedData(),
        settings({
            dataLabels: { ...settings().dataLabels, labelDensity: density }
        }),
        crowdedDimensions()
    );
    chart.render();
    // Axis tick labels live under .x-axis / .y-axis; data labels are loose <text>.
    const texts = container.selectAll<SVGTextElement, unknown>("text").nodes()
        .filter(node => !node.closest(".x-axis") && !node.closest(".y-axis"))
        .map(node => node.textContent ?? "");
    d3.select(document.body).selectAll("svg").remove();
    return texts;
}

describe("textMeasure", () => {
    beforeEach(() => resetTextMeasurementCache());

    describe("measureTextWidth", () => {
        it("returns zero for empty text", () => {
            expect(measureTextWidth("", STYLE)).toBe(0);
        });

        it("returns zero for a nonpositive or nonfinite font size", () => {
            expect(measureTextWidth("hello", { fontSize: 0 })).toBe(0);
            expect(measureTextWidth("hello", { fontSize: Number.NaN })).toBe(0);
        });

        it("grows monotonically with string length", () => {
            const short = measureTextWidth("12", STYLE);
            const medium = measureTextWidth("12345", STYLE);
            const long = measureTextWidth("1234567890", STYLE);
            expect(short).toBeGreaterThan(0);
            expect(medium).toBeGreaterThan(short);
            expect(long).toBeGreaterThan(medium);
        });

        it("scales with font size", () => {
            const small = measureTextWidth("Revenue", { fontSize: 8 });
            const large = measureTextWidth("Revenue", { fontSize: 24 });
            expect(large).toBeGreaterThan(small);
        });

        it("is memoised: repeated calls return an identical value", () => {
            const first = measureTextWidth("Consistent", STYLE);
            const second = measureTextWidth("Consistent", STYLE);
            expect(second).toBe(first);
        });

        it("keys the cache on style, not just text", () => {
            const atTen = measureTextWidth("Same text", { fontSize: 10 });
            const atTwenty = measureTextWidth("Same text", { fontSize: 20 });
            expect(atTwenty).not.toBe(atTen);
        });
    });

    describe("truncateToWidth", () => {
        it("leaves text that already fits untouched", () => {
            const text = "Jan";
            expect(truncateToWidth(text, 500, STYLE)).toBe(text);
        });

        it("appends an ellipsis when it must cut", () => {
            const result = truncateToWidth("An extremely long category label", 40, STYLE);
            expect(result.endsWith(ELLIPSIS)).toBe(true);
            expect(result.length).toBeLessThan("An extremely long category label".length);
        });

        it("produces a result that actually fits the budget", () => {
            const maxWidth = 45;
            const result = truncateToWidth("An extremely long category label", maxWidth, STYLE);
            expect(measureTextWidth(result, STYLE)).toBeLessThanOrEqual(maxWidth);
        });

        it("returns the ellipsis alone when only it fits", () => {
            const ellipsisWidth = measureTextWidth(ELLIPSIS, STYLE);
            expect(truncateToWidth("Wide label", ellipsisWidth, STYLE)).toBe(ELLIPSIS);
        });

        it("returns empty string when not even the ellipsis fits", () => {
            expect(truncateToWidth("Wide label", 0.01, STYLE)).toBe("");
        });

        it("passes through when the budget is nonpositive or nonfinite", () => {
            expect(truncateToWidth("Jan", 0, STYLE)).toBe("Jan");
            expect(truncateToWidth("Jan", Number.NaN, STYLE)).toBe("Jan");
        });

        it("handles empty input", () => {
            expect(truncateToWidth("", 100, STYLE)).toBe("");
        });

        it("does not split surrogate pairs", () => {
            const emoji = "📈📉📈📉📈📉📈📉";
            const result = truncateToWidth(emoji, 30, STYLE);
            expect(result).not.toContain("\uFFFD");
            // Every code point kept must be a whole emoji.
            const body = result.replace(ELLIPSIS, "");
            expect(Array.from(body).every(ch => emoji.includes(ch))).toBe(true);
        });
    });

    describe("resolveLabelCollisions", () => {
        it("returns nothing for no slots", () => {
            expect(resolveLabelCollisions([], 4)).toEqual([]);
        });

        it("keeps every label when they all fit", () => {
            const slots = [0, 50, 100, 150].map((center, index) => ({ index, center, size: 20 }));
            expect(resolveLabelCollisions(slots, 4)).toEqual([0, 1, 2, 3]);
        });

        it("drops overlapping labels", () => {
            const slots = [0, 5, 10, 15, 20].map((center, index) => ({ index, center, size: 20 }));
            const visible = resolveLabelCollisions(slots, 4);
            expect(visible.length).toBeLessThan(slots.length);
        });

        it("never returns two labels that overlap", () => {
            const slots = Array.from({ length: 30 }, (_, index) => ({
                index,
                center: index * 7,
                size: 18
            }));
            const visible = new Set(resolveLabelCollisions(slots, 4));
            const kept = slots.filter(slot => visible.has(slot.index));
            for (let i = 1; i < kept.length; i++) {
                const previous = kept[i - 1];
                const current = kept[i];
                const clearance = (current.center - current.size / 2) - (previous.center + previous.size / 2);
                expect(clearance).toBeGreaterThanOrEqual(4);
            }
        });

        it("protects anchor indices ahead of ordinary labels", () => {
            const slots = Array.from({ length: 20 }, (_, index) => ({
                index,
                center: index * 6,
                size: 30
            }));
            const anchors = new Set([0, 19]);
            const visible = resolveLabelCollisions(slots, 2, anchors);
            expect(visible).toContain(0);
            expect(visible).toContain(19);
        });

        it("returns indices in ascending order", () => {
            const slots = [300, 100, 200, 0].map((center, index) => ({ index, center, size: 10 }));
            const visible = resolveLabelCollisions(slots, 1);
            expect([...visible].sort((a, b) => a - b)).toEqual(visible);
        });

        it("treats a nonpositive gap as no gap", () => {
            const slots = [0, 20, 40].map((center, index) => ({ index, center, size: 20 }));
            expect(resolveLabelCollisions(slots, -5)).toEqual([0, 1, 2]);
        });
    });
});

describe("labelDensity: auto", () => {
    const chartTypes: ChartType[] = [
        "variance", "waterfall", "column", "columnStacked",
        "bar", "line", "area", "combo", "dot", "lollipop"
    ];

    /**
     * Reads back the real geometry of every rendered data label so overlap can be
     * asserted against what is actually painted, not against the planner's model.
     *
     * Pass `singleSeries` to omit the comparison measure. Each category then emits
     * exactly one label, so any overlap found is necessarily between two *different*
     * categories — which is precisely what label density controls.
     */
    function renderLabelBoxes(
        chartType: ChartType,
        density: "all" | "auto",
        categoryCount: number,
        width: number,
        singleSeries = false
    ): Array<{ left: number; right: number; top: number; bottom: number }> {
        const categories = Array.from({ length: categoryCount }, (_, i) => `Period ${i + 1}`);
        const data = parseDataView(buildMockDataView({
            categories,
            actual: categories.map((_, i) => 1000 + i * 137),
            ...(singleSeries ? {} : { budget: categories.map((_, i) => 1100 + i * 121) })
        }))!;

        const container = d3.select(document.body).append("svg").append("g");
        createChart(
            chartType,
            container as d3.Selection<SVGGElement, unknown, null, undefined>,
            data,
            settings({ dataLabels: { ...settings().dataLabels, labelDensity: density } }),
            { width, height: 220, margin: { top: 10, right: 10, bottom: 30, left: 40 } }
        ).render();

        const fontSize = 10;
        const boxes = container.selectAll<SVGTextElement, unknown>("text").nodes()
            .filter(node => !node.closest(".x-axis") && !node.closest(".y-axis"))
            .map(node => {
                const text = node.textContent ?? "";
                const x = Number(node.getAttribute("x") ?? 0);
                const y = Number(node.getAttribute("y") ?? 0);
                const anchor = node.getAttribute("text-anchor") ?? "start";
                const textWidth = measureTextWidth(text, {
                    fontSize,
                    fontFamily: DEFAULT_FONT_FAMILY,
                    fontWeight: node.getAttribute("font-weight") ?? undefined
                });
                const left = anchor === "middle" ? x - textWidth / 2 : anchor === "end" ? x - textWidth : x;
                return {
                    left,
                    right: left + textWidth,
                    top: y - fontSize,
                    bottom: y
                };
            });

        d3.select(document.body).selectAll("svg").remove();
        return boxes;
    }

    function overlappingPairs(
        boxes: Array<{ left: number; right: number; top: number; bottom: number }>
    ): number {
        let count = 0;
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const b = boxes[j];
                const overlapsX = a.left < b.right && b.left < a.right;
                const overlapsY = a.top < b.bottom && b.top < a.bottom;
                if (overlapsX && overlapsY) count++;
            }
        }
        return count;
    }

    it.each(chartTypes)("renders no more labels than 'all' for %s", chartType => {
        const all = renderLabels(chartType, "all");
        const auto = renderLabels(chartType, "auto");
        expect(auto.length).toBeLessThanOrEqual(all.length);
    });

    it.each(chartTypes)("still renders at least one label for %s", chartType => {
        expect(renderLabels(chartType, "auto").length).toBeGreaterThan(0);
    });

    // Regression guard for the core promise: no two categories' labels may collide.
    // Single-series data means one label per category, so every overlap counted here
    // is a genuine cross-category collision.
    it.each(chartTypes)("leaves no cross-category label overlap for %s", chartType => {
        for (const [count, width] of [[14, 420], [24, 260], [40, 300]] as Array<[number, number]>) {
            const boxes = renderLabelBoxes(chartType, "auto", count, width, true);
            expect(
                overlappingPairs(boxes),
                `${chartType}: ${count} categories at ${width}px`
            ).toBe(0);
        }
    });

    // planAutoLabels must reserve the whole cluster a category draws. Charts that emit
    // one label per series (grouped column/bar, multi-series line) and the variance
    // chart's value+variance pair previously under-reserved space, so "auto" thinned
    // nothing and behaved identically to "all".
    it.each([
        ["column", 8, 420],
        ["column", 14, 420],
        ["bar", 14, 420],
        ["variance", 14, 420]
    ] as Array<[ChartType, number, number]>)(
        "reserves the full multi-label cluster for %s (%i categories at %ipx)",
        (chartType, categoryCount, width) => {
            const all = renderLabelBoxes(chartType, "all", categoryCount, width);
            const auto = renderLabelBoxes(chartType, "auto", categoryCount, width);
            expect(overlappingPairs(all)).toBeGreaterThan(0);
            expect(auto.length).toBeLessThan(all.length);
        }
    );

    it("thins a crowded variance chart", () => {
        const all = renderLabels("variance", "all");
        const auto = renderLabels("variance", "auto");
        expect(auto.length).toBeLessThan(all.length);
    });

    it("does not thin when there is ample room", () => {
        const container = d3.select(document.body).append("svg").append("g");
        const data = parseDataView(buildMockDataView({
            categories: ["Jan", "Feb"],
            actual: [100, 150],
            budget: [110, 140]
        }))!;
        const chart = createChart(
            "variance",
            container as d3.Selection<SVGGElement, unknown, null, undefined>,
            data,
            settings({ dataLabels: { ...settings().dataLabels, labelDensity: "auto" } }),
            { width: 900, height: 400, margin: { top: 20, right: 20, bottom: 40, left: 50 } }
        );
        chart.render();
        const labels = container.selectAll<SVGTextElement, unknown>("text").nodes()
            .filter(node => !node.closest(".x-axis") && !node.closest(".y-axis"));
        d3.select(document.body).selectAll("svg").remove();
        expect(labels.length).toBeGreaterThan(0);
    });
});
