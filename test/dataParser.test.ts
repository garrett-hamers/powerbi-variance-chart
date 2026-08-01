import { describe, it, expect } from "vitest";
import {
    parseDataView, applyTopN, getVariance, getVariancePct, getComparisonValue,
    getAvailableComparisonType, getGroupKeys, getSemanticVariance, calculateSemanticVariance,
    DataPoint, ParsedData, TopNOptions, subsetParsedData
} from "../src/dataParser";
import { formatModelValue, formatNumber, formatPrimitiveValue, formatVariance } from "../src/utils/formatting";
import { buildMockDataView, buildEmptyDataView, buildCategoriesOnlyDataView } from "./helpers/mockDataView";

// ── parseDataView ──

describe("parseDataView", () => {
    it("parses basic categories and actual values", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 300]
        });
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
        expect(result!.dataPoints).toHaveLength(3);
        expect(result!.dataPoints[0].category).toBe("Jan");
        expect(result!.dataPoints[0].actual).toBe(100);
        expect(result!.hasActual).toBe(true);
    });

    it("calculates variance to budget correctly", () => {
        const dv = buildMockDataView({
            categories: ["Q1"],
            actual: [120],
            budget: [100]
        });
        const result = parseDataView(dv)!;
        expect(result.hasBudget).toBe(true);
        expect(result.dataPoints[0].varianceToBudget).toBe(20);
        expect(result.dataPoints[0].varianceToBudgetPct).toBe(20); // 20/100 * 100
    });

    it("calculates variance to previous year correctly", () => {
        const dv = buildMockDataView({
            categories: ["Q1"],
            actual: [90],
            previousYear: [100]
        });
        const result = parseDataView(dv)!;
        expect(result.hasPreviousYear).toBe(true);
        expect(result.dataPoints[0].varianceToPY).toBe(-10);
        expect(result.dataPoints[0].varianceToPYPct).toBe(-10); // -10/100 * 100
    });

    it("calculates variance to forecast correctly", () => {
        const dv = buildMockDataView({
            categories: ["Q1"],
            actual: [150],
            forecast: [200]
        });
        const result = parseDataView(dv)!;
        expect(result.hasForecast).toBe(true);
        expect(result.dataPoints[0].varianceToFC).toBe(-50);
        expect(result.dataPoints[0].varianceToFCPct).toBe(-25); // -50/200 * 100
    });

    it("represents zero-base percentage as undefined while retaining absolute variance", () => {
        const dv = buildMockDataView({
            categories: ["Q1"],
            actual: [50],
            budget: [0]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].varianceToBudget).toBe(50);
        expect(result.dataPoints[0].varianceToBudgetPct).toBeNull();
    });

    it("parses groups and sets hasGroups", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Jan", "Feb"],
            actual: [100, 200, 150, 250],
            groups: ["East", "East", "West", "West"]
        });
        const result = parseDataView(dv)!;
        expect(result.hasGroups).toBe(true);
        expect(result.groups).toContain("East");
        expect(result.groups).toContain("West");
        expect(result.groups).toHaveLength(2);
        expect(result.dataPoints[2].group).toBe("West");
    });

    it("parses comments and sets hasComments", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb"],
            actual: [100, 200],
            comments: ["Good month", ""]
        });
        const result = parseDataView(dv)!;
        expect(result.hasComments).toBe(true);
        expect(result.dataPoints[0].comment).toBe("Good month");
        expect(result.dataPoints[1].comment).toBe("");
    });

    it("preserves active Power BI highlight state per source row", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 300],
            budget: [90, 210, 280],
            highlights: {
                actual: [100, null, null],
                budget: [90, null, null]
            }
        });
        const result = parseDataView(dv)!;
        expect(result.hasHighlights).toBe(true);
        expect(result.dataPoints.map(point => point.highlighted)).toEqual([true, false, false]);
    });

    it("parses tooltips role measures into data points", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb"],
            actual: [100, 200],
            tooltipMeasures: [
                { displayName: "Gross Margin", values: [35, 42] },
                { displayName: "Owner", values: ["Alice", "Bob"] }
            ]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].tooltipFields).toEqual([
            { displayName: "Gross Margin", value: "35" },
            { displayName: "Owner", value: "Alice" }
        ]);
        expect(result.dataPoints[1].tooltipFields).toEqual([
            { displayName: "Gross Margin", value: "42" },
            { displayName: "Owner", value: "Bob" }
        ]);
    });

    it("skips null, empty, or nonfinite tooltip values but keeps zero", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar", "Apr"],
            actual: [100, 200, 300, 400],
            tooltipMeasures: [
                { displayName: "KPI", values: [null, 0, "", Number.POSITIVE_INFINITY] }
            ]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].tooltipFields).toEqual([]);
        expect(result.dataPoints[1].tooltipFields).toEqual([{ displayName: "KPI", value: "0" }]);
        expect(result.dataPoints[2].tooltipFields).toEqual([]);
        expect(result.dataPoints[3].tooltipFields).toEqual([]);
    });

    it("calculates totals across all data points", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [10, 20, 30],
            budget: [15, 25, 35]
        });
        const result = parseDataView(dv)!;
        expect(result.totals.actual).toBe(60);
        expect(result.totals.budget).toBe(75);
    });

    it("marks either host reduction signal as partial", () => {
        const segmented = buildMockDataView({ categories: ["A"], actual: [1] });
        segmented.metadata.segment = {};
        const reduced = buildMockDataView({ categories: ["A"], actual: [1] });
        reduced.metadata.dataReduction = {};
        expect(parseDataView(segmented)?.completeness?.state).toBe("partial");
        expect(parseDataView(reduced)?.completeness?.state).toBe("partial");
    });

    it("tracks maxValue and minValue", () => {
        const dv = buildMockDataView({
            categories: ["A", "B"],
            actual: [100, -50],
            budget: [200, 80]
        });
        const result = parseDataView(dv)!;
        expect(result.maxValue).toBeGreaterThanOrEqual(200);
        expect(result.minValue).toBeLessThanOrEqual(-50);
    });

    it("assigns sequential index to each data point", () => {
        const dv = buildMockDataView({
            categories: ["A", "B", "C"],
            actual: [1, 2, 3]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints.map(d => d.index)).toEqual([0, 1, 2]);
        expect(result.dataPoints.map(d => d.sourceIndices)).toEqual([[0], [1], [2]]);
    });

    it("normalizes signed zero and rejects missing, non-finite, and wrong-type measures", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["zero", "negative zero", "null", "undefined", "nan", "infinity", "text"],
            actual: [0, -0, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, "12"],
            budget: [0, -0, 1]
        }))!;
        expect(result.dataPoints.map(point => point.actual)).toEqual([0, 0, null, null, null, null, null]);
        expect(result.dataPoints.map(point => point.budget)).toEqual([0, 0, 1, null, null, null, null]);
        expect(result.dataPoints[0].varianceToBudget).toBe(0);
        expect(result.dataPoints[0].varianceToBudgetPct).toBeNull();
        expect(result.dataPoints[3].varianceToBudget).toBeNull();
        expect(result.totals.actual).toBe(0);
        expect(result.totals.budget).toBe(1);
    });

    it("treats all-null measure columns as unavailable while preserving finite zero", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["A", "B"],
            actual: [0, null],
            budget: [null, Number.NaN],
            previousYear: [null, Number.POSITIVE_INFINITY],
            forecast: [0, null]
        }))!;
        expect(result.hasActual).toBe(true);
        expect(result.hasBudget).toBe(false);
        expect(result.hasPreviousYear).toBe(false);
        expect(result.hasForecast).toBe(true);

        const noActual = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [null],
            budget: [1]
        }))!;
        expect(noActual.hasActual).toBe(false);
    });

    it("contains overflow in variances and totals", () => {
        const max = Number.MAX_VALUE;
        const result = parseDataView(buildMockDataView({
            categories: ["A", "B"],
            actual: [max, max],
            budget: [-max, 0]
        }))!;
        expect(result.dataPoints[0].varianceToBudget).toBeNull();
        expect(result.totals.actual).toBeNull();
        expect(Number.isFinite(result.maxValue)).toBe(true);
        expect(Number.isFinite(result.minValue)).toBe(true);
    });

    it("uses abs(base) for finite negative comparisons", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [-80],
            budget: [-100]
        }))!;
        expect(result.dataPoints[0].varianceToBudget).toBe(20);
        expect(result.dataPoints[0].varianceToBudgetPct).toBe(20);
    });

    it("preserves model formats and formats tooltip numbers with locale", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [1234.5],
            formats: { actual: "$#,0.00" },
            tooltipMeasures: [{ displayName: "Margin", values: [1234.5], format: "$#,0.00" }]
        }), "en-US")!;
        expect(result.formats.actual).toBe("$#,0.00");
        expect(result.locale).toBe("en-US");
        expect(result.dataPoints[0].tooltipFields?.[0].value).toBe("$1,234.50");
    });

    it("uses the requested locale's numeric separators", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [1234.5],
            tooltipMeasures: [{ displayName: "Localized", values: [1234.5], format: "#,0.00" }]
        }), "de-DE")!;
        expect(result.dataPoints[0].tooltipFields?.[0].value).toBe("1.234,50");
    });

    it("formats date tooltip values with the model format and host locale", () => {
        const result = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [1],
            tooltipMeasures: [{
                displayName: "As of",
                values: [new Date("2025-01-15T00:00:00.000Z")],
                format: "MMM d, yyyy"
            }]
        }), "en-US")!;
        expect(result.dataPoints[0].tooltipFields?.[0].value).toBe("Jan 15, 2025");
    });

    it("preserves and formats raw numeric/date category and group values", () => {
        const date = new Date("2025-01-15T00:00:00.000Z");
        const result = parseDataView(buildMockDataView({
            categories: [1234.5, date],
            groups: [date, 1234.5],
            actual: [1, 2],
            formats: {
                category: "#,0.00",
                group: "MMM yyyy"
            }
        }), "en-US")!;
        expect(result.dataPoints[0].category).toBe("1,234.50");
        expect(result.dataPoints[0].categoryValue).toBe(1234.5);
        expect(result.dataPoints[0].categoryFormat).toBe("#,0.00");
        expect(result.dataPoints[0].group).toBe("Jan 2025");
        expect(result.dataPoints[0].groupValue).toBe(date);
        expect(result.dataPoints[0].groupFormat).toBe("MMM yyyy");
    });

    it("falls back deterministically only to an available comparator", () => {
        const cases = [
            { input: { budget: [90] }, expected: "budget" },
            { input: { previousYear: [80] }, expected: "previousYear" },
            { input: { forecast: [110] }, expected: "forecast" },
            { input: {}, expected: null }
        ] as const;
        for (const testCase of cases) {
            const data = parseDataView(buildMockDataView({
                categories: ["A"], actual: [100], ...testCase.input
            }))!;
            expect(getAvailableComparisonType(data, "forecast")).toBe(testCase.expected);
        }
    });

    // ─── Edge cases ───

    it("returns null for empty DataView", () => {
        const dv = buildEmptyDataView();
        expect(parseDataView(dv)).toBeNull();
    });

    it("returns null for categories-only DataView (no values)", () => {
        const dv = buildCategoriesOnlyDataView(["A", "B"]);
        expect(parseDataView(dv)).toBeNull();
    });

    it("returns null for null/undefined input", () => {
        expect(parseDataView(null as any)).toBeNull();
        expect(parseDataView(undefined as any)).toBeNull();
    });

    it("handles single row correctly", () => {
        const dv = buildMockDataView({
            categories: ["Only"],
            actual: [42],
            budget: [40]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints).toHaveLength(1);
        expect(result.dataPoints[0].category).toBe("Only");
        expect(result.dataPoints[0].varianceToBudget).toBe(2);
    });

    it("sets hasBudget/hasPY/hasFC to false when not provided", () => {
        const dv = buildMockDataView({
            categories: ["A"],
            actual: [100]
        });
        const result = parseDataView(dv)!;
        expect(result.hasBudget).toBe(false);
        expect(result.hasPreviousYear).toBe(false);
        expect(result.hasForecast).toBe(false);
        expect(result.hasGroups).toBe(false);
        expect(result.hasComments).toBe(false);
    });
});

// ── Variance helper functions ──

describe("getVariance / getVariancePct / getComparisonValue", () => {
    const dp: DataPoint = {
        category: "Q1", group: "", actual: 120,
        budget: 100, previousYear: 110, forecast: 130,
        comment: "",
        varianceToBudget: 20, varianceToBudgetPct: 20,
        varianceToPY: 10, varianceToPYPct: 9.09,
        varianceToFC: -10, varianceToFCPct: -7.69,
        index: 0, sourceIndices: [0]
    };

    it("returns budget variance for 'budget' type", () => {
        expect(getVariance(dp, "budget")).toBe(20);
        expect(getVariancePct(dp, "budget")).toBe(20);
        expect(getComparisonValue(dp, "budget")).toBe(100);
    });

    it("returns PY variance for 'previousYear' type", () => {
        expect(getVariance(dp, "previousYear")).toBe(10);
        expect(getVariancePct(dp, "previousYear")).toBe(9.09);
        expect(getComparisonValue(dp, "previousYear")).toBe(110);
    });

    it("returns forecast variance for 'forecast' type", () => {
        expect(getVariance(dp, "forecast")).toBe(-10);
        expect(getVariancePct(dp, "forecast")).toBe(-7.69);
        expect(getComparisonValue(dp, "forecast")).toBe(130);
    });
});

describe("semantic variance engine", () => {
    it.each([
        {
            name: "valid positive reference",
            actual: 120,
            reference: 100,
            kind: "valid",
            variance: 20,
            percentage: 20
        },
        {
            name: "valid negative reference",
            actual: -80,
            reference: -100,
            kind: "valid",
            variance: 20,
            percentage: 20
        },
        {
            name: "zero reference",
            actual: 50,
            reference: 0,
            kind: "zeroReference",
            variance: 50,
            percentage: null
        },
        {
            name: "missing reference",
            actual: 50,
            reference: null,
            kind: "missing",
            variance: null,
            percentage: null
        },
        {
            name: "non-finite actual",
            actual: Number.POSITIVE_INFINITY,
            reference: 10,
            kind: "nonFinite",
            variance: null,
            percentage: null
        }
    ])("classifies $name without fabricating a percentage", testCase => {
        const result = calculateSemanticVariance(testCase.actual, testCase.reference);
        expect(result.kind).toBe(testCase.kind);
        expect(result.variance).toBe(testCase.variance);
        expect(result.percentage).toBe(testCase.percentage);
        expect(result.aggregation).toBe("additive");
        expect(result.direction).toBe("higherIsBetter");
    });

    it("preserves the documented formula while orienting lower-is-better metrics", () => {
        const canonical = calculateSemanticVariance(80, 100);
        const cost = calculateSemanticVariance(80, 100, {
            aggregation: "additive",
            direction: "lowerIsBetter"
        });
        expect(canonical).toMatchObject({
            variance: -20,
            percentage: -20,
            outcome: "unfavorable"
        });
        expect(cost).toMatchObject({
            variance: 20,
            percentage: 20,
            outcome: "favorable"
        });
    });

    it("keeps every finite input result finite across representative signs", () => {
        const values = [-1_000_000, -100, -1, 0, 1, 100, 1_000_000];
        for (const actual of values) {
            for (const reference of values) {
                const result = calculateSemanticVariance(actual, reference);
                if (result.variance !== null) expect(Number.isFinite(result.variance)).toBe(true);
                if (result.percentage !== null) expect(Number.isFinite(result.percentage)).toBe(true);
                expect(String(result.variance)).not.toMatch(/NaN|Infinity/);
                expect(String(result.percentage)).not.toMatch(/NaN|Infinity/);
            }
        }
    });

    it("retains non-finite provenance after parser normalization", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A"],
            actual: [Number.NaN],
            budget: [10]
        }))!;
        expect(getSemanticVariance(data.dataPoints[0], "budget").kind).toBe("nonFinite");
    });
});

// ── applyTopN ──

describe("applyTopN", () => {
    function makeData(count: number): ParsedData {
        const dv = buildMockDataView({
            categories: Array.from({ length: count }, (_, i) => `Cat${i + 1}`),
            actual: Array.from({ length: count }, (_, i) => (i + 1) * 100),
            budget: Array.from({ length: count }, (_, i) => (i + 1) * 90)
        });
        return parseDataView(dv)!;
    }

    const baseOpts: TopNOptions = {
        enable: true,
        count: 3,
        sortBy: "value",
        sortDirection: "desc",
        showOthers: true,
        othersLabel: "Others",
        comparisonType: "budget"
    };

    it("returns original data when disabled", () => {
        const data = makeData(5);
        const result = applyTopN(data, { ...baseOpts, enable: false });
        expect(result.dataPoints).toHaveLength(5);
    });

    it("returns original data when count >= dataPoints", () => {
        const data = makeData(3);
        const result = applyTopN(data, { ...baseOpts, count: 5 });
        expect(result.dataPoints).toHaveLength(3);
    });

    it("returns top N + Others when enabled", () => {
        const data = makeData(5);
        const result = applyTopN(data, baseOpts);
        expect(result.dataPoints).toHaveLength(4); // 3 top + 1 Others
        expect(result.dataPoints[3].category).toBe("Others");
    });

    it("Others aggregates remaining values", () => {
        const data = makeData(5);
        const result = applyTopN(data, baseOpts);
        const others = result.dataPoints[3];
        // Top 3 desc by actual: Cat5(500), Cat4(400), Cat3(300)
        // Others: Cat1(100) + Cat2(200) = 300
        expect(others.actual).toBe(300);
    });

    it("omits Others when the host data is partial", () => {
        const data = makeData(5);
        data.completeness = { state: "partial", reason: "hostDataReduction" };
        const result = applyTopN(data, baseOpts);
        expect(result.dataPoints.map(point => point.category)).toEqual(["Cat5", "Cat4", "Cat3"]);
        expect(result.topNState).toEqual({
            applied: true,
            completeness: "partial",
            others: "omittedPartial"
        });
    });

    it("omits Others for non-additive measures", () => {
        const result = applyTopN(makeData(5), { ...baseOpts, aggregation: "nonAdditive" });
        expect(result.dataPoints).toHaveLength(3);
        expect(result.topNState?.others).toBe("omittedNonAdditive");
    });

    it("marks a complete Others aggregate explicitly", () => {
        const result = applyTopN(makeData(5), baseOpts);
        expect(result.topNState).toEqual({
            applied: true,
            completeness: "complete",
            others: "complete"
        });
    });

    it("returns top N without Others when showOthers=false", () => {
        const data = makeData(5);
        const result = applyTopN(data, { ...baseOpts, showOthers: false });
        expect(result.dataPoints).toHaveLength(3);
    });

    it("sorts by name ascending", () => {
        const data = makeData(5);
        const result = applyTopN(data, { ...baseOpts, sortBy: "name", sortDirection: "asc", showOthers: false });
        expect(result.dataPoints[0].category).toBe("Cat1");
        expect(result.dataPoints[1].category).toBe("Cat2");
        expect(result.dataPoints[2].category).toBe("Cat3");
    });

    it("ranks variance using the displayed lower-is-better direction", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["Small cost", "Large cost", "On plan"],
            actual: [80, 50, 100],
            budget: [100, 100, 100]
        }))!;
        const result = applyTopN(data, {
            ...baseOpts,
            count: 1,
            sortBy: "variance",
            showOthers: false,
            direction: "lowerIsBetter"
        });
        expect(result.dataPoints.map(point => point.category)).toEqual(["Large cost"]);
    });

    it("keeps malformed variance rows deterministic and ties stable", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["Tie B", "Tie A", "Missing", "Nonfinite"],
            actual: [110, 110, null, Number.POSITIVE_INFINITY],
            budget: [100, 100, 100, 100]
        }))!;
        const result = applyTopN(data, {
            ...baseOpts,
            count: 3,
            sortBy: "variance",
            showOthers: false
        });
        expect(result.dataPoints.map(point => point.category)).toEqual(["Tie A", "Tie B", "Missing"]);
        expect(result.dataPoints.every(point => point.actual === null || Number.isFinite(point.actual))).toBe(true);
    });

    it("ranks each group with the same semantic variance contract", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A", "B", "A", "B"],
            groups: ["East", "East", "West", "West"],
            actual: [80, 50, 120, 90],
            budget: [100, 100, 100, 100]
        }))!;
        const result = applyTopN(data, {
            ...baseOpts,
            count: 1,
            sortBy: "variance",
            showOthers: false,
            direction: "lowerIsBetter"
        });
        expect(result.dataPoints.map(point => `${point.group}:${point.category}`)).toEqual([
            "East:B", "West:B"
        ]);
    });

    it("Others has recalculated variances", () => {
        const data = makeData(5);
        const result = applyTopN(data, baseOpts);
        const others = result.dataPoints[3];
        // Cat1: actual=100, budget=90 → variance=10
        // Cat2: actual=200, budget=180 → variance=20
        // Others: actual=300, budget=270 → variance=30
        expect(others.varianceToBudget).toBe(others.actual - others.budget);
    });

    it("recomputes totals/extents/groups and preserves source metadata after Top N", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A", "B", "C", "D"],
            actual: [100, -40, 30, 20],
            budget: [90, -50, 20, 10]
        }))!;
        const result = applyTopN(data, { ...baseOpts, count: 2 });
        expect(result.dataPoints[0].index).toBe(0);
        expect(result.dataPoints[1].index).toBe(2);
        expect(result.dataPoints[2].index).toBeNull();
        expect(result.dataPoints[2].sourceIndices).toEqual([3, 1]);
        expect(result.dataPoints[2].isSynthetic).toBe(true);
        expect(result.totals.actual).toBe(110);
        expect(result.minValue).toBeLessThanOrEqual(-20);
        expect(result.maxValue).toBeGreaterThanOrEqual(100);
        expect(result.groups).toEqual([]);
    });

    it("ranks each group independently and keeps one local Others point per group", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["B1", "B2", "B3", "A1", "A2", "A3"],
            groups: ["Beta", "Beta", "Beta", "Alpha", "Alpha", "Alpha"],
            actual: [10, 30, 20, 100, 300, 200],
            budget: [8, 25, 18, 90, 250, 180]
        }))!;
        const result = applyTopN(data, { ...baseOpts, count: 1 });
        expect(result.groups).toEqual(["Beta", "Alpha"]);
        expect(result.dataPoints.map(point => `${point.group}:${point.category}`)).toEqual([
            "Beta:B2", "Beta:Others", "Alpha:A2", "Alpha:Others"
        ]);
        expect(result.dataPoints[1].actual).toBe(30);
        expect(result.dataPoints[1].groupValue).toBe("Beta");
        expect(result.dataPoints[1].sourceIndices).toEqual([2, 0]);
        expect(result.dataPoints[3].actual).toBe(300);
        expect(result.dataPoints[3].sourceIndices).toEqual([5, 3]);
    });

    it("keeps distinct raw groups separate when their formatted labels match", () => {
        const first = new Date("2025-01-15T00:00:00.000Z");
        const second = new Date("2025-01-20T00:00:00.000Z");
        const data = parseDataView(buildMockDataView({
            categories: ["A", "B", "A", "B"],
            groups: [first, first, second, second],
            actual: [10, 20, 100, 200],
            budget: [8, 18, 90, 180],
            formats: { group: "MMM yyyy" }
        }), "en-US")!;
        expect(data.groups).toEqual(["Jan 2025", "Jan 2025"]);
        expect(new Set(getGroupKeys(data)).size).toBe(2);

        const result = applyTopN(data, { ...baseOpts, count: 1 });
        expect(getGroupKeys(result)).toHaveLength(2);
        expect(result.dataPoints.map(point => point.actual)).toEqual([20, 10, 200, 100]);
        expect(result.dataPoints[0].groupKey).not.toBe(result.dataPoints[2].groupKey);
    });

    it("recomputes local metadata for safe small-multiple subsets", () => {
        const data = parseDataView(buildMockDataView({
            categories: ["A", "B", "C"],
            groups: ["East", "East", "West"],
            comments: ["note", "", ""],
            actual: [10, -2, 10_000],
            budget: [8, -3, 9_000]
        }))!;
        const east = subsetParsedData(data, data.dataPoints.slice(0, 2));
        expect(east.groups).toEqual(["East"]);
        expect(east.totals.actual).toBe(8);
        expect(east.maxValue).toBeLessThan(100);
        expect(east.minValue).toBeLessThan(0);
        expect(east.hasComments).toBe(true);
    });
});

describe("formatting resilience", () => {
    it("falls back safely for invalid locales and excessive model precision", () => {
        const malformedFormat = `#,0.${"0".repeat(100)}`;
        expect(() => formatModelValue(1234.567, malformedFormat, "not_a_locale")).not.toThrow();
        expect(formatModelValue(1234.567, malformedFormat, "not_a_locale")).not.toBe("");
    });

    it("formats primitive dates and configured numbers without trusting locale metadata", () => {
        expect(() => formatPrimitiveValue(
            new Date("2024-01-02T00:00:00Z"),
            "yyyy-MM-dd",
            "x"
        )).not.toThrow();
        expect(() => formatNumber(-1234.5, {
            scale: "none",
            decimals: 2,
            locale: "x",
            showSign: true
        })).not.toThrow();
    });

    it("never fabricates an unavailable percentage", () => {
        expect(formatVariance(50, null, true)).toBe("+50.0");
        expect(formatVariance(50, Number.NaN, true)).toBe("+50.0");
        expect(formatVariance(50, 25, true)).toBe("+50.0 (+25.0%)");
    });
});
