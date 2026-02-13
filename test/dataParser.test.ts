import { describe, it, expect } from "vitest";
import { parseDataView, applyTopN, getVariance, getVariancePct, getComparisonValue, DataPoint, ParsedData, TopNOptions } from "../src/dataParser";
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

    it("handles zero base value for percentage (no divide by zero)", () => {
        const dv = buildMockDataView({
            categories: ["Q1"],
            actual: [50],
            budget: [0]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].varianceToBudgetPct).toBe(0);
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

    it("skips null or empty tooltip values but keeps zero", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 300],
            tooltipMeasures: [
                { displayName: "KPI", values: [null, 0, ""] }
            ]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].tooltipFields).toEqual([]);
        expect(result.dataPoints[1].tooltipFields).toEqual([{ displayName: "KPI", value: "0" }]);
        expect(result.dataPoints[2].tooltipFields).toEqual([]);
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
        index: 0
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

    it("Others has recalculated variances", () => {
        const data = makeData(5);
        const result = applyTopN(data, baseOpts);
        const others = result.dataPoints[3];
        // Cat1: actual=100, budget=90 → variance=10
        // Cat2: actual=200, budget=180 → variance=20
        // Others: actual=300, budget=270 → variance=30
        expect(others.varianceToBudget).toBe(others.actual - others.budget);
    });
});
