/**
 * @vitest-environment happy-dom
 *
 * Verifies the visual's getFormattingModel() output structure matches
 * the declarations in capabilities.json.  The test is kept deliberately
 * repo-agnostic so it can be copy-pasted into every visual in the fleet.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { createMockHost, MockHost } from "../e2e/mocks/host";

const FIXTURE_PATH = "e2e/fixtures/yoy.json";

function loadJson(rel: string): any {
    return JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf8"));
}

function cardObjectName(card: any): string | undefined {
    if (card?.name) return card.name;
    const uid: string | undefined = card?.uid;
    if (uid && uid.endsWith("-card")) return uid.slice(0, -"-card".length);
    return uid;
}

function slicePropertyName(slice: any): string | undefined {
    return (
        slice?.control?.properties?.descriptor?.propertyName ??
        slice?.descriptor?.propertyName ??
        slice?.name
    );
}

function sliceEnumItemValues(slice: any): Set<string> {
    const raw =
        slice?.control?.properties?.items ??
        slice?.items ??
        [];
    return new Set(raw.map((it: any) => String(it?.value?.value ?? it?.value ?? it)));
}

function allGroups(card: any): any[] {
    return card?.groups ?? [];
}

function allSlices(model: any): any[] {
    const out: any[] = [];
    for (const card of model?.cards ?? []) {
        for (const group of allGroups(card)) {
            for (const slice of group?.slices ?? []) out.push(slice);
        }
    }
    return out;
}

function capsNonFilterObjects(caps: any): Array<{ name: string; properties: Record<string, any> }> {
    const result: Array<{ name: string; properties: Record<string, any> }> = [];
    for (const [name, obj] of Object.entries<any>(caps?.objects ?? {})) {
        if (name === "general") continue;
        const nonFilter: Record<string, any> = {};
        for (const [pname, pdef] of Object.entries<any>(obj?.properties ?? {})) {
            if (pdef?.type?.filter) continue;
            nonFilter[pname] = pdef;
        }
        if (Object.keys(nonFilter).length > 0) {
            result.push({ name, properties: nonFilter });
        }
    }
    return result;
}

function countCapsNonFilterProperties(caps: any): number {
    let n = 0;
    for (const obj of capsNonFilterObjects(caps)) {
        n += Object.keys(obj.properties).length;
    }
    return n;
}

describe("getFormattingModel() ↔ capabilities.json", () => {
    let element: HTMLElement;
    let host: MockHost;
    let visual: Visual;
    let capabilities: any;
    let model: any;

    beforeEach(() => {
        capabilities = loadJson("capabilities.json");
        const fixture = loadJson(FIXTURE_PATH);

        element = document.createElement("div");
        document.body.appendChild(element);
        host = createMockHost();
        visual = new Visual({ element, host } as VisualConstructorOptions);

        const updateOptions = {
            dataViews: [fixture],
            viewport: { width: 600, height: 400 },
            type: 2,
        } as unknown as VisualUpdateOptions;

        visual.update(updateOptions);
        model = visual.getFormattingModel();
    });

    it("returns a FormattingModel with a non-empty cards[] array", () => {
        expect(model).toBeDefined();
        expect(Array.isArray(model.cards)).toBe(true);
        expect(model.cards.length).toBeGreaterThan(0);
    });

    it("every card.name corresponds to an object name in capabilities.json", () => {
        const validObjectNames = new Set(Object.keys(capabilities?.objects ?? {}));
        for (const card of model.cards) {
            const name = cardObjectName(card);
            expect(name, `card missing name/uid`).toBeDefined();
            expect(
                validObjectNames.has(name!),
                `card "${name}" is not declared in capabilities.json`
            ).toBe(true);
        }
    });

    it("every non-filter capabilities object has a corresponding card", () => {
        const cardNames = new Set(model.cards.map((c: any) => cardObjectName(c)));
        const missing = capsNonFilterObjects(capabilities)
            .map(o => o.name)
            .filter(n => !cardNames.has(n));
        expect(missing, `missing cards for capabilities objects: [${missing.join(", ")}]`).toHaveLength(0);
    });

    it("each card has at least one group with at least one slice", () => {
        for (const card of model.cards) {
            const groups = allGroups(card);
            expect(groups.length, `card ${cardObjectName(card)} has no groups`).toBeGreaterThan(0);
            const sliceCount = groups.reduce((s: number, g: any) => s + (g?.slices?.length ?? 0), 0);
            expect(sliceCount, `card ${cardObjectName(card)} has no slices`).toBeGreaterThan(0);
        }
    });

    it("enumeration slices expose every enum value declared in capabilities", () => {
        for (const card of model.cards) {
            const name = cardObjectName(card);
            const capsObj = name ? capabilities.objects?.[name] : undefined;
            if (!capsObj) continue;
            for (const group of allGroups(card)) {
                for (const slice of group?.slices ?? []) {
                    const propName = slicePropertyName(slice);
                    if (!propName) continue;
                    const enumDef = capsObj.properties?.[propName]?.type?.enumeration;
                    if (!Array.isArray(enumDef)) continue;
                    const have = sliceEnumItemValues(slice);
                    for (const expected of enumDef) {
                        expect(
                            have.has(expected.value),
                            `card ${name}.${propName} missing enum value "${expected.value}" (have: ${[...have].join(",")})`
                        ).toBe(true);
                    }
                }
            }
        }
    });

    it("no card slice references a property missing from capabilities.json (reverse drift)", () => {
        const extras: string[] = [];
        for (const card of model.cards) {
            const name = cardObjectName(card);
            const validProps = new Set(
                Object.keys((name && capabilities.objects?.[name]?.properties) ?? {})
            );
            for (const group of allGroups(card)) {
                for (const slice of group?.slices ?? []) {
                    const propName = slicePropertyName(slice);
                    if (!propName) continue;
                    if (!validProps.has(propName)) {
                        extras.push(`${name}.${propName}`);
                    }
                }
            }
        }
        expect(extras, `extra slice properties not in capabilities: [${extras.join(", ")}]`).toHaveLength(0);
    });

    it("does not call host.persistProperties on initial load", () => {
        expect(host.spies.persistProperties.callCount()).toBe(0);
    });

    it("total slice count is within ±10 of capabilities non-filter property count", () => {
        const sliceCount = allSlices(model).length;
        const capCount = countCapsNonFilterProperties(capabilities);
        expect(
            Math.abs(sliceCount - capCount),
            `slices=${sliceCount}, capabilitiesNonFilterProps=${capCount}`
        ).toBeLessThanOrEqual(10);
    });
});
