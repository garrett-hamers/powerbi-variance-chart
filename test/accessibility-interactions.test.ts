/**
 * @vitest-environment happy-dom
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

function makeUpdateOptions(dataView: any, width = 640, height = 420): VisualUpdateOptions {
    return { dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2 } as any;
}

function baseDataView() {
    return buildMockDataView({
        categories: ["Jan", "Feb", "Mar"],
        actual: [100, 200, 150],
        budget: [90, 180, 160],
        comments: ["Jan: launch variance", "", ""]
    });
}

function firstDataMark(): SVGElement {
    const mark = element.querySelector("rect[data-index], circle[data-index]") as SVGElement | null;
    expect(mark).not.toBeNull();
    return mark!;
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("Variance chart P0 accessibility and keyboard interactions", () => {
    beforeEach(() => {
        element = document.createElement("div");
        document.body.appendChild(element);
        host = createMockHost();
        visual = new Visual({ element, host } as VisualConstructorOptions);
        visual.update(makeUpdateOptions(baseDataView()));
    });

    it("makes data marks tabbable buttons with useful ARIA names and state", () => {
        const mark = firstDataMark();
        const label = mark.getAttribute("aria-label") || "";

        expect(mark.getAttribute("tabindex")).toBe("0");
        expect(mark.getAttribute("role")).toBe("button");
        expect(mark.getAttribute("aria-pressed")).toBe("false");
        expect(label).toContain("Jan");
        expect(label).toContain("Actual");
        expect(label).toContain("100");
        expect(label).toContain("Variance");
    });

    it("selects with Enter and exposes pressed state", async () => {
        const mark = firstDataMark();
        mark.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await flushPromises();

        expect(host.spies.select.callCount()).toBe(1);
        expect(host.spies.select.lastCall()?.args.multiSelect).toBe(false);
        expect(mark.getAttribute("aria-pressed")).toBe("true");
    });

    it("supports Ctrl+Space multi-select and Escape clear", async () => {
        const marks = element.querySelectorAll("rect[data-index], circle[data-index]");
        const first = marks[0] as SVGElement;
        const second = Array.from(marks).find(m => m.getAttribute("data-index") === "1") as SVGElement;

        first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await flushPromises();
        second.dispatchEvent(new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true, cancelable: true }));
        await flushPromises();

        expect(host.spies.select.callCount()).toBe(2);
        expect(host.spies.select.lastCall()?.args.multiSelect).toBe(true);

        second.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await flushPromises();
        expect(host.spies.clear.callCount()).toBe(1);
        expect(first.getAttribute("aria-pressed")).toBe("false");
        expect(second.getAttribute("aria-pressed")).toBe("false");
    });

    it("passes data identity for mark context menus and empty identity for background", () => {
        const mark = firstDataMark();
        mark.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 50,
            clientY: 60
        }));

        expect(host.spies.showContextMenu.callCount()).toBe(1);
        const dataCall = host.spies.showContextMenu.lastCall()?.args;
        expect(dataCall?.selectionId?.hasIdentity?.()).toBe(true);
        expect(dataCall?.position).toEqual({ x: 50, y: 60 });

        host.spies.showContextMenu.reset();
        const svg = element.querySelector("svg.varianceChart") as SVGSVGElement;
        svg.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 10,
            clientY: 20
        }));

        expect(host.spies.showContextMenu.callCount()).toBe(1);
        expect(host.spies.showContextMenu.lastCall()?.args.selectionId).toEqual({});
    });

    it("opens context menu from Shift+F10 for the focused data point", () => {
        const mark = firstDataMark();
        mark.dispatchEvent(new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true,
            cancelable: true
        }));

        expect(host.spies.showContextMenu.callCount()).toBe(1);
        expect(host.spies.showContextMenu.lastCall()?.args.selectionId?.hasIdentity?.()).toBe(true);
    });

    it("uses highlight values in tooltips when Power BI sends cross-highlight arrays", () => {
        const highlighted = JSON.parse(JSON.stringify(baseDataView()));
        highlighted.categorical.values[0].highlights = [40, null, null];
        visual.update(makeUpdateOptions(highlighted));

        const mark = firstDataMark();
        mark.dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true,
            cancelable: true,
            clientX: 80,
            clientY: 90
        }));

        const items = host.spies.tooltipShow.lastCall()?.args.dataItems;
        expect(items.find((item: any) => item.displayName === "Actual")?.value).toContain("40");
        expect(items.find((item: any) => item.displayName === "Total Actual")?.value).toContain("100");
    });

    it("uses the host high-contrast palette for data marks", () => {
        element = document.createElement("div");
        document.body.appendChild(element);
        host = createMockHost({
            isHighContrast: true,
            palette: {
                foreground: "#FFFF00",
                background: "#000000",
                foregroundSelected: "#00FFFF",
                hyperlink: "#FFFF00"
            }
        });
        visual = new Visual({ element, host } as VisualConstructorOptions);
        visual.update(makeUpdateOptions(baseDataView()));

        const colors = new Set(
            Array.from(element.querySelectorAll("rect[data-index], circle[data-index]"))
                .flatMap(mark => [mark.getAttribute("fill"), mark.getAttribute("stroke")])
                .filter((value): value is string => !!value && value !== "none" && !value.startsWith("url("))
                .map(value => value.toLowerCase())
        );

        expect(colors.has("#ffff00")).toBe(true);
        expect(colors.has("#404040")).toBe(false);
        expect(colors.has("#4caf50")).toBe(false);
    });
});
