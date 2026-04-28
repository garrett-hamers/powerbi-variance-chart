/**
 * @vitest-environment happy-dom
 *
 * Bookmarks path: verify the visual registers an onSelect callback and
 * correctly restores its highlighted state when Power BI pushes selection
 * through that callback (the bookmarks restore path).
 */
import { describe, it, expect, beforeEach } from "vitest";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";
import { createMockHost, MockHost } from "../e2e/mocks/host";

let visual: Visual;
let element: HTMLElement;
let host: MockHost;

function makeUpdateOptions(dataView: any, width = 600, height = 400): VisualUpdateOptions {
    return { dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2 } as any;
}

const categorySource = { source: { queryName: "Table.Category" } } as any;

function makeId(index: number) {
    return host
        .createSelectionIdBuilder()
        .withCategory(categorySource, index)
        .createSelectionId();
}

function opacityOf(index: number): string {
    const r = element.querySelector(`rect[data-index="${index}"]`) as SVGRectElement | null;
    return r ? r.style.opacity : "";
}

beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
    host = createMockHost();
    visual = new Visual({ element, host } as VisualConstructorOptions);
    const dv = buildMockDataView({
        categories: ["A", "B", "C"],
        actual: [100, 200, 300],
        budget: [90, 180, 270],
    });
    visual.update(makeUpdateOptions(dv));
});

describe("Variance chart — bookmarks (registerOnSelectCallback)", () => {
    it("registers the onSelect callback on init", () => {
        expect(host.spies.registerOnSelectCallback.callCount()).toBeGreaterThanOrEqual(1);
        expect(typeof host.getRegisteredSelectCallback()).toBe("function");
    });

    it("fireSelectCallback([idA, idC]) highlights only bars 0 and 2", () => {
        host.fireSelectCallback([makeId(0), makeId(2)]);
        expect(opacityOf(0)).toBe("1");
        expect(opacityOf(1)).toBe("0.3");
        expect(opacityOf(2)).toBe("1");
    });

    it("fireSelectCallback([]) clears the highlight", () => {
        host.fireSelectCallback([makeId(0)]);
        expect(opacityOf(1)).toBe("0.3");
        host.fireSelectCallback([]);
        expect(opacityOf(0)).toBe("1");
        expect(opacityOf(1)).toBe("1");
        expect(opacityOf(2)).toBe("1");
    });

    it("bookmark callback overrides a prior user click selection", async () => {
        const rectB = element.querySelector(`rect[data-index="1"]`) as SVGRectElement | null;
        expect(rectB).not.toBeNull();
        rectB!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
        expect(opacityOf(1)).toBe("1");

        host.fireSelectCallback([makeId(0)]);
        expect(opacityOf(0)).toBe("1");
        expect(opacityOf(1)).toBe("0.3");
        expect(opacityOf(2)).toBe("0.3");
    });
});
