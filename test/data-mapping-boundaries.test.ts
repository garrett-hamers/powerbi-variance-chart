/**
 * Boundary-condition tests for parseDataView() — Variance chart.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseDataView } from "../src/dataParser";
import { buildMockDataView, buildEmptyDataView } from "./helpers/mockDataView";

describe("parseDataView — boundary conditions (variance)", () => {
    it("empty DataView returns null, does not throw", () => {
        expect(() => parseDataView(buildEmptyDataView())).not.toThrow();
        expect(parseDataView(buildEmptyDataView())).toBeNull();
    });

    it("null / undefined DataView returns null, does not throw", () => {
        expect(() => parseDataView(null as any)).not.toThrow();
        expect(() => parseDataView(undefined as any)).not.toThrow();
        expect(parseDataView(null as any)).toBeNull();
        expect(parseDataView(undefined as any)).toBeNull();
    });

    it("missing required 'category' role: returns null", () => {
        const dv: any = {
            categorical: {
                categories: undefined,
                values: [{ source: { roles: { actual: true } }, values: [1, 2] }]
            }
        };
        expect(parseDataView(dv)).toBeNull();
    });

    it("missing required 'actual' role: returns null", () => {
        const dv = buildMockDataView({
            categories: ["A", "B"],
            actual: [1, 2],
            budget: [1, 2]
        });
        dv.categorical.values = dv.categorical.values.filter(
            (v: any) => !v.source.roles?.actual
        );
        expect(parseDataView(dv)).toBeNull();
    });

    it("extra unknown-role columns ignored without error", () => {
        const dv = buildMockDataView({ categories: ["A"], actual: [10] });
        dv.categorical.values.push({
            source: { displayName: "Unknown", roles: { foo: true } },
            values: [999]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints).toHaveLength(1);
        expect(result.dataPoints[0].actual).toBe(10);
    });

    it("numeric role receiving strings: coerces or falls back to 0", () => {
        const dv = buildMockDataView({
            categories: ["A", "B"],
            actual: ["42" as any, "bad" as any]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints[0].actual).toBe(42);
        expect(result.dataPoints[1].actual).toBe(0);
    });

    it("large cardinality (10k rows) parses in <1s", () => {
        const n = 10_000;
        const categories = Array.from({ length: n }, (_, i) => `C${i}`);
        const actual = Array.from({ length: n }, (_, i) => i);
        const budget = Array.from({ length: n }, (_, i) => i + 1);
        const dv = buildMockDataView({ categories, actual, budget });
        const start = Date.now();
        const result = parseDataView(dv)!;
        const elapsed = Date.now() - start;
        expect(result.dataPoints).toHaveLength(n);
        expect(elapsed).toBeLessThan(1000);
    });

    it("mixed null values (category, actual, budget, group, comments) don't produce NaN", () => {
        const dv = buildMockDataView({
            categories: ["A", null as any, "C"],
            actual: [10, null as any, 30],
            budget: [null as any, 20, null as any],
            groups: ["G1", null as any, "G2"],
            comments: ["hi", null as any, "there"]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints).toHaveLength(3);
        for (const dp of result.dataPoints) {
            expect(Number.isNaN(dp.actual)).toBe(false);
            expect(Number.isNaN(dp.budget)).toBe(false);
            expect(Number.isNaN(dp.varianceToBudget)).toBe(false);
        }
        expect(Number.isNaN(result.maxValue)).toBe(false);
        expect(Number.isNaN(result.minValue)).toBe(false);
    });

    it("boolean category source type: valid string model", () => {
        const dv: any = {
            categorical: {
                categories: [{
                    source: { type: { bool: true }, roles: { category: true } },
                    values: [true, false]
                }],
                values: [{
                    source: { displayName: "Actual", roles: { actual: true } },
                    values: [10, 20]
                }]
            }
        };
        const result = parseDataView(dv)!;
        expect(result.dataPoints.map(d => d.category)).toEqual(["true", "false"]);
    });

    it("date category source type: valid string model", () => {
        const dv: any = {
            categorical: {
                categories: [{
                    source: { type: { dateTime: true }, roles: { category: true } },
                    values: [new Date("2024-01-01"), new Date("2024-02-01")]
                }],
                values: [{
                    source: { displayName: "Actual", roles: { actual: true } },
                    values: [10, 20]
                }]
            }
        };
        const result = parseDataView(dv)!;
        expect(result.dataPoints).toHaveLength(2);
        expect(typeof result.dataPoints[0].category).toBe("string");
    });

    it("highlight array mismatch (shorter/longer than values) handled gracefully", () => {
        const dv = buildMockDataView({ categories: ["A", "B"], actual: [1, 2] });
        (dv.categorical.values[0] as any).highlights = [1];
        expect(() => parseDataView(dv)).not.toThrow();
        (dv.categorical.values[0] as any).highlights = [1, 2, 3, 4];
        expect(() => parseDataView(dv)).not.toThrow();
    });

    it("duplicate category values kept deterministically", () => {
        const dv = buildMockDataView({
            categories: ["A", "A", "B"],
            actual: [1, 2, 3]
        });
        const result = parseDataView(dv)!;
        expect(result.dataPoints.map(d => d.category)).toEqual(["A", "A", "B"]);
    });

    it("loads large.json fixture without throwing", () => {
        const fixturePath = path.resolve(__dirname, "../e2e/fixtures/large.json");
        const dv = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        expect(() => parseDataView(dv)).not.toThrow();
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
    });
});
