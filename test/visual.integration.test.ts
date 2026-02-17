/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";

let visual: Visual;
let element: HTMLElement;

function createMockHost(): any {
    // Manual mock since createVisualHost may have compatibility issues
    const selectionIds: any[] = [];
    return {
        createSelectionIdBuilder: () => {
            const builder: any = {
                withCategory: () => builder,
                withMeasure: () => builder,
                withSeries: () => builder,
                createSelectionId: () => ({ getKey: () => "mock-key-" + selectionIds.length })
            };
            return builder;
        },
        createSelectionManager: () => ({
            select: () => Promise.resolve([]),
            clear: () => Promise.resolve([]),
            registerOnSelectCallback: () => {},
            showContextMenu: () => {}
        }),
        tooltipService: {
            show: () => {},
            move: () => {},
            hide: () => {},
            enabled: () => true
        },
        colorPalette: {},
        eventService: {
            renderingStarted: () => {},
            renderingFinished: () => {},
            renderingFailed: () => {}
        }
    };
}

beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
    const host = createMockHost();
    visual = new Visual({ element, host } as VisualConstructorOptions);
});

function makeUpdateOptions(dataView: any, width = 600, height = 400): VisualUpdateOptions {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2
    } as any;
}

describe("Visual integration", () => {
    it("constructor creates SVG with class varianceChart", () => {
        expect(element.querySelector("svg.varianceChart")).not.toBeNull();
    });

    it("constructor creates g.chartContainer", () => {
        expect(element.querySelector("svg g.chartContainer")).not.toBeNull();
    });

    it("update with valid data produces chart content", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 150],
            budget: [110, 180, 160]
        });
        visual.update(makeUpdateOptions(dv));
        expect(element.querySelectorAll("svg rect").length).toBeGreaterThan(0);
    });

    it("update with null dataViews renders landing page", () => {
        visual.update(makeUpdateOptions(null));
        const textContent = element.querySelector("svg")?.textContent || "";
        expect(textContent).toContain("Variance");
    });

    it("update with empty dataViews array renders landing page", () => {
        visual.update({
            dataViews: [],
            viewport: { width: 600, height: 400 },
            type: 2
        } as any);
        const textContent = element.querySelector("svg")?.textContent || "";
        expect(textContent).toContain("Variance");
    });

    it("second update replaces previous content", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 150],
            budget: [110, 180, 160]
        });
        visual.update(makeUpdateOptions(dv));
        const firstCount = element.querySelectorAll("svg rect").length;

        visual.update(makeUpdateOptions(dv));
        const secondCount = element.querySelectorAll("svg rect").length;
        expect(secondCount).toBe(firstCount);
    });

    it("small viewport (50x50) does not throw", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 150],
            budget: [110, 180, 160]
        });
        expect(() => visual.update(makeUpdateOptions(dv, 50, 50))).not.toThrow();
    });

    it("getFormattingModel returns object with cards", () => {
        const dv = buildMockDataView({
            categories: ["Jan"],
            actual: [100],
            budget: [110]
        });
        visual.update(makeUpdateOptions(dv));
        const model = visual.getFormattingModel();
        expect(model).toBeDefined();
        expect(typeof model).toBe("object");
    });

    it("SVG width/height match viewport after update", () => {
        const dv = buildMockDataView({
            categories: ["Jan"],
            actual: [100],
            budget: [110]
        });
        visual.update(makeUpdateOptions(dv, 800, 500));
        const svg = element.querySelector("svg.varianceChart");
        expect(svg?.getAttribute("width")).toBe("800");
        expect(svg?.getAttribute("height")).toBe("500");
    });

    it("update with budget data renders comparison elements", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 150],
            budget: [110, 180, 160]
        });
        visual.update(makeUpdateOptions(dv));
        expect(element.querySelectorAll("svg rect").length).toBeGreaterThan(0);
    });

    it("update with actual-only data still renders", () => {
        const dv = buildMockDataView({
            categories: ["Jan", "Feb", "Mar"],
            actual: [100, 200, 150]
        });
        visual.update(makeUpdateOptions(dv));
        // Should render without errors even without budget
        const svg = element.querySelector("svg.varianceChart");
        expect(svg).not.toBeNull();
    });

    it("context menu handler does not throw on right-click", () => {
        const svg = element.querySelector("svg.varianceChart");
        expect(svg).not.toBeNull();
        expect(() => {
            const event = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 100,
                clientY: 100
            });
            svg!.dispatchEvent(event);
        }).not.toThrow();
    });
});
