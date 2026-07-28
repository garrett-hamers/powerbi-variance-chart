// Vitest suite for scripts/capabilities-matrix.mjs
// Runs in each repo -- asserts type detection, enum extraction, and
// repo-specific property counts.

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { detectType, buildMatrix } from "./capabilities-matrix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CAP = join(REPO_ROOT, "capabilities.json");
const PBI = join(REPO_ROOT, "pbiviz.json");

describe("detectType", () => {
    it("bool", () => expect(detectType({ bool: true }).type).toBe("bool"));
    it("text", () => expect(detectType({ text: true }).type).toBe("text"));
    it("numeric", () => expect(detectType({ numeric: true }).type).toBe("numeric"));
    it("integer", () => expect(detectType({ integer: true }).type).toBe("integer"));
    it("color (fill.solid.color)", () =>
        expect(detectType({ fill: { solid: { color: true } } }).type).toBe("color"));
    it("filter", () => expect(detectType({ filter: true }).type).toBe("filter"));
    it("formatting", () =>
        expect(detectType({ formatting: { fontSize: true } }).type).toBe("formatting"));
    it("unknown for empty", () => expect(detectType({}).type).toBe("unknown"));
    it("unknown for null", () => expect(detectType(null).type).toBe("unknown"));

    it("enumeration populates enumValues", () => {
        const r = detectType({
            enumeration: [
                { value: "a", displayName: "A" },
                { value: "b", displayName: "B" },
            ],
        });
        expect(r.type).toBe("enumeration");
        expect(r.enumValues).toHaveLength(2);
        expect(r.enumValues[0]).toEqual({ value: "a", displayName: "A" });
    });
});

describe("buildMatrix (synthetic)", () => {
    it("produces entries with correct shape", () => {
        const tmp = mkdtempSync(join(tmpdir(), "capmat-"));
        const capPath = join(tmp, "capabilities.json");
        writeFileSync(
            capPath,
            JSON.stringify({
                dataRoles: [{ name: "v", displayName: "V", kind: "Measure" }],
                objects: {
                    general: { properties: { filter: { type: { filter: true } } } },
                    settings: {
                        properties: {
                            showIt: { displayName: "Show", type: { bool: true } },
                            color: { type: { fill: { solid: { color: true } } } },
                            mode: {
                                type: {
                                    enumeration: [
                                        { value: "a", displayName: "A" },
                                        { value: "b", displayName: "B" },
                                    ],
                                },
                            },
                        },
                    },
                },
            })
        );
        const m = buildMatrix(capPath);
        expect(m.propertyCount).toBe(4);
        const byName = Object.fromEntries(
            m.properties.map((p) => [`${p.objectName}.${p.propertyName}`, p])
        );
        expect(byName["general.filter"].type).toBe("filter");
        expect(byName["general.filter"].isFilter).toBe(true);
        expect(byName["settings.showIt"].type).toBe("bool");
        expect(byName["settings.showIt"].displayName).toBe("Show");
        expect(byName["settings.color"].type).toBe("color");
        expect(byName["settings.mode"].type).toBe("enumeration");
        expect(byName["settings.mode"].enumValues).toHaveLength(2);
    });
});

describe("buildMatrix (real repo capabilities.json)", () => {
    it("reads this repo's capabilities.json", () => {
        expect(existsSync(CAP)).toBe(true);
        const m = buildMatrix(CAP, existsSync(PBI) ? PBI : undefined);
        expect(m.propertyCount).toBeGreaterThan(0);
        expect(Array.isArray(m.properties)).toBe(true);
        // every property must declare a non-empty objectName and propertyName
        for (const p of m.properties) {
            expect(p.objectName).toBeTruthy();
            expect(p.propertyName).toBeTruthy();
            expect(typeof p.isFilter).toBe("boolean");
        }
    });

    it("has no unknown types (every PBI type is detected)", () => {
        const m = buildMatrix(CAP, existsSync(PBI) ? PBI : undefined);
        const unknowns = m.properties.filter((p) => p.type === "unknown");
        expect(unknowns).toEqual([]);
    });

    // The Playwright format-pane suite builds its entire test matrix from the committed
    // fixture, so if the fixture drifts from capabilities.json the e2e run silently
    // stops exercising new properties and keeps driving deleted ones. Regenerate with
    // `npm run matrix` whenever capabilities.json changes.
    it("committed e2e fixture matches the live capabilities.json", () => {
        const fixturePath = join(REPO_ROOT, "e2e", "fixtures", "capabilities-matrix.json");
        expect(existsSync(fixturePath)).toBe(true);

        const committed = JSON.parse(readFileSync(fixturePath, "utf8"));
        const fresh = buildMatrix(CAP, existsSync(PBI) ? PBI : undefined);

        const normalize = (matrix) => ({
            ...matrix,
            generatedAt: undefined,
            properties: [...matrix.properties].sort((a, b) =>
                `${a.objectName}.${a.propertyName}`.localeCompare(`${b.objectName}.${b.propertyName}`)
            ),
        });

        expect(committed.propertyCount).toBe(fresh.propertyCount);
        expect(normalize(committed)).toEqual(normalize(fresh));
    });
});
