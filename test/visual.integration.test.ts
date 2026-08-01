/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import powerbi from "powerbi-visuals-api";
import { BasicFilter, TupleFilter } from "powerbi-models";
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import less from "less";

import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionIdBuilder = powerbi.visuals.ISelectionIdBuilder;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

interface HostHarness {
    host: IVisualHost;
    events: string[];
    select: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    contextMenu: ReturnType<typeof vi.fn>;
    applyJsonFilter: ReturnType<typeof vi.fn>;
    tooltipShow: ReturnType<typeof vi.fn>;
    drill: ReturnType<typeof vi.fn>;
    displayWarningIcon: ReturnType<typeof vi.fn>;
    selectedIds: ISelectionId[];
    rejectSelection: boolean;
    rejectClear: boolean;
    rejectFilter: boolean;
}

function selectionId(index: number): ISelectionId {
    const key = `selection-${index}`;
    return {
        equals: other => other.getKey() === key,
        includes: other => other.getKey() === key,
        getKey: () => key,
        getSelector: () => ({}),
        getSelectorsByColumn: () => ({}),
        hasIdentity: () => true
    } as ISelectionId;
}

function createHostHarness(options: {
    highContrast?: boolean;
    locale?: string;
    allowInteractions?: boolean;
} = {}): HostHarness {
    const harness = {
        events: [] as string[],
        selectedIds: [] as ISelectionId[],
        rejectSelection: false,
        rejectClear: false,
        rejectFilter: false
    } as HostHarness;
    const callbacks: Array<(ids: powerbi.extensibility.ISelectionId[]) => void> = [];
    const select = vi.fn((ids: ISelectionId | ISelectionId[], multiSelect = false) => {
        if (harness.rejectSelection) return Promise.reject(new Error("selection rejected"));
        const incoming = Array.isArray(ids) ? ids : [ids];
        harness.selectedIds = multiSelect ? [...harness.selectedIds, ...incoming] : incoming;
        callbacks.forEach(callback => callback(harness.selectedIds));
        return Promise.resolve(harness.selectedIds);
    });
    const clear = vi.fn(() => {
        if (harness.rejectClear) return Promise.reject(new Error("clear rejected"));
        harness.selectedIds = [];
        callbacks.forEach(callback => callback([]));
        return Promise.resolve({});
    });
    const contextMenu = vi.fn(() => Promise.resolve({}));
    const applyJsonFilter = vi.fn(() => {
        if (harness.rejectFilter) throw new Error("filter rejected");
    });
    const tooltipShow = vi.fn();
    const drill = vi.fn();
    const displayWarningIcon = vi.fn();

    const selectionManager = {
        select,
        clear,
        getSelectionIds: () => harness.selectedIds,
        hasSelection: () => harness.selectedIds.length > 0,
        registerOnSelectCallback: (callback: (ids: powerbi.extensibility.ISelectionId[]) => void) => callbacks.push(callback),
        showContextMenu: contextMenu,
        toggleExpandCollapse: () => Promise.resolve({})
    };

    let builderIndex = 0;
    const createSelectionIdBuilder = (): ISelectionIdBuilder => {
        const builder: ISelectionIdBuilder = {
            withCategory: (_column, index) => {
                builderIndex = index;
                return builder;
            },
            withSeries: () => builder,
            withMeasure: () => builder,
            withMatrixNode: () => builder,
            withTable: (_table, index) => {
                builderIndex = index;
                return builder;
            },
            createSelectionId: () => selectionId(builderIndex)
        };
        return builder;
    };

    const color = (value: string) => ({ value });
    const palette = {
        isHighContrast: options.highContrast ?? false,
        foreground: color("#101010"),
        foregroundLight: color("#303030"),
        foregroundDark: color("#000000"),
        foregroundNeutralLight: color("#555555"),
        foregroundNeutralDark: color("#202020"),
        foregroundNeutralSecondary: color("#404040"),
        foregroundNeutralSecondaryAlt: color("#505050"),
        foregroundNeutralSecondaryAlt2: color("#606060"),
        foregroundNeutralTertiary: color("#707070"),
        foregroundNeutralTertiaryAlt: color("#808080"),
        foregroundSelected: color("#005a9e"),
        foregroundButton: color("#101010"),
        background: color("#fefefe"),
        backgroundLight: color("#ffffff"),
        backgroundNeutral: color("#eeeeee"),
        backgroundDark: color("#dddddd"),
        hyperlink: color("#005a9e"),
        visitedHyperlink: color("#744da9"),
        mapPushpin: color("#005a9e"),
        shapeStroke: color("#101010"),
        positive: color("#16833a"),
        neutral: color("#777777"),
        negative: color("#c42b1c"),
        getColor: (key: string) => color(key === "Actual" ? "#123456" : `#${key.length}56565`),
        reset() {
            return this;
        }
    };

    harness.select = select;
    harness.clear = clear;
    harness.contextMenu = contextMenu;
    harness.applyJsonFilter = applyJsonFilter;
    harness.tooltipShow = tooltipShow;
    harness.drill = drill;
    harness.displayWarningIcon = displayWarningIcon;
    harness.host = {
        createSelectionIdBuilder,
        createSelectionManager: () => selectionManager,
        tooltipService: {
            show: tooltipShow,
            move: vi.fn(),
            hide: vi.fn(),
            enabled: () => true
        },
        colorPalette: palette,
        eventService: {
            renderingStarted: () => harness.events.push("started"),
            renderingFinished: () => harness.events.push("finished"),
            renderingFailed: () => harness.events.push("failed")
        },
        hostCapabilities: { allowInteractions: options.allowInteractions ?? true },
        locale: options.locale ?? "en-US",
        applyJsonFilter,
        drill,
        displayWarningIcon
    } as IVisualHost;
    return harness;
}

function updateOptions(
    dataView: DataView | null,
    width = 600,
    height = 400,
    jsonFilters?: powerbi.IFilter[]
): VisualUpdateOptions {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2,
        jsonFilters
    };
}

function dataView(input: Parameters<typeof buildMockDataView>[0]): DataView {
    return buildMockDataView(input) as DataView;
}

function setObjects(view: DataView, objects: powerbi.DataViewObjects): void {
    view.metadata.objects = objects;
}

function dispatchClick(element: Element, init: MouseEventInit = {}): void {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

function firstPoint(root: HTMLElement, source = "0"): SVGElement {
    const point = root.querySelector<SVGElement>(`[data-source-indices="${source}"]`);
    if (!point) throw new Error(`Missing point ${source}`);
    return point;
}

describe("Visual host integration", () => {
    let element: HTMLElement;
    let harness: HostHarness;
    let visual: Visual;

    beforeEach(() => {
        document.body.textContent = "";
        element = document.createElement("div");
        document.body.appendChild(element);
        harness = createHostHarness();
        visual = new Visual({ element, host: harness.host } as VisualConstructorOptions);
    });

    it("initializes an accessible visual and formatting model before update", () => {
        const svg = element.querySelector("svg.varianceChart");
        expect(svg?.getAttribute("role")).toBe("group");
        expect(svg?.getAttribute("aria-label")).toContain("Atlyn");
        expect(visual.getFormattingModel().cards.length).toBeGreaterThan(0);
    });

    it.each([
        ["data", dataView({ categories: ["A"], actual: [10], budget: [8] })],
        ["no data", null]
    ])("emits exactly started then finished for %s", (_name, view) => {
        visual.update(updateOptions(view));
        expect(harness.events).toEqual(["started", "finished"]);
    });

    it("emits started then failed, catches rendering errors, and renders an alert", () => {
        const broken = { metadata: { columns: [] } } as DataView;
        Object.defineProperty(broken, "categorical", {
            get: () => {
                throw new Error("private model details");
            }
        });
        expect(() => visual.update(updateOptions(broken))).not.toThrow();
        expect(harness.events).toEqual(["started", "failed"]);
        expect(element.querySelector('[role="alert"]')?.textContent).not.toContain("private");
        expect(element.textContent).toContain("could not be rendered");
    });

    it("keeps formatting, selection, focus, and status state independent by instance", async () => {
        const secondElement = document.createElement("div");
        document.body.appendChild(secondElement);
        const secondHarness = createHostHarness();
        const second = new Visual({ element: secondElement, host: secondHarness.host } as VisualConstructorOptions);
        const view = dataView({ categories: ["A", "B"], actual: [10, 20], budget: [9, 18] });
        visual.update(updateOptions(view));
        second.update(updateOptions(view));
        dispatchClick(firstPoint(element));
        await Promise.resolve();
        expect(harness.select).toHaveBeenCalledTimes(1);
        expect(secondHarness.select).not.toHaveBeenCalled();
        expect(secondElement.querySelector(".host-selected")).toBeNull();
        expect(second.getFormattingModel()).not.toBe(visual.getFormattingModel());
    });

    it("sizes no-data SVG before checks and resets dense overflow on resize", () => {
        visual.update(updateOptions(null, 321, 123));
        const svg = element.querySelector("svg");
        expect(svg?.getAttribute("width")).toBe("321");
        expect(svg?.getAttribute("height")).toBe("123");

        const categories = Array.from({ length: 40 }, (_, index) => `Category ${index}`);
        visual.update(updateOptions(dataView({
            categories,
            actual: categories.map((_, index) => index + 1),
            budget: categories.map((_, index) => index)
        }), 300, 200));
        expect(Number(svg?.getAttribute("width"))).toBeGreaterThan(300);
        expect(getComputedStyle(element).overflow).toBe("auto");

        visual.update(updateOptions(null, 200, 100));
        expect(svg?.getAttribute("width")).toBe("200");
        expect(svg?.getAttribute("height")).toBe("100");
    });

    it("uses stable original source indices for Top N and the Others aggregate", async () => {
        const view = dataView({
            categories: ["Largest", "Middle", "Smallest"],
            actual: [100, 50, 1],
            budget: [90, 45, 2]
        });
        setObjects(view, {
            topN: { enable: true, count: 1, showOthers: true, sortBy: "value", sortDirection: "desc" }
        });
        visual.update(updateOptions(view));
        expect(element.querySelector('[data-source-indices="0"]')).not.toBeNull();
        const aggregate = firstPoint(element, "1,2");
        expect(aggregate.getAttribute("data-dp-index")).toBeNull();
        dispatchClick(aggregate);
        await Promise.resolve();
        const selected = harness.select.mock.calls[0][0] as ISelectionId[];
        expect(selected.map(id => id.getKey())).toEqual(["selection-1", "selection-2"]);
    });

    it("highlights the matching comment affordances and clears them with selection", async () => {
        const lessSource = readFileSync(
            join(process.cwd(), "style", "visual.less"),
            "utf8"
        );
        const compiled = await less.render(lessSource);
        const styleElement = document.createElement("style");
        styleElement.textContent = compiled.css;
        document.head.appendChild(styleElement);

        const view = dataView({
            categories: ["A", "B"],
            actual: [10, 20],
            budget: [8, 18],
            comments: ["First note", "Second note"]
        });
        visual.update(updateOptions(view, 700, 400));
        dispatchClick(firstPoint(element, "0"));
        await Promise.resolve();
        const matching = element.querySelectorAll('[data-comment-source="0"]');
        expect(matching.length).toBeGreaterThan(1);
        expect(Array.from(matching).every(node => node.classList.contains("comment-highlighted"))).toBe(true);

        // Guard against the highlight rule being nested where markers never live:
        // the compiled stylesheet must actually resolve stroke-width onto the marker.
        const marker = element.querySelector<SVGElement>("circle.comment-marker.comment-highlighted");
        expect(marker).not.toBeNull();
        expect(getComputedStyle(marker!).strokeWidth).toBe("3px");

        dispatchClick(element.querySelector("svg.varianceChart")!);
        await Promise.resolve();
        expect(element.querySelector(".comment-highlighted")).toBeNull();
        styleElement.remove();
    });

    it("keeps grouped Top N Others inside every small-multiple group", () => {
        const view = dataView({
            categories: ["A", "B", "C", "A", "B", "C"],
            groups: ["East", "East", "East", "West", "West", "West"],
            actual: [30, 20, 10, 300, 200, 100],
            budget: [25, 18, 9, 250, 180, 90]
        });
        setObjects(view, {
            topN: { enable: true, count: 1, showOthers: true, sortBy: "value", sortDirection: "desc" }
        });
        visual.update(updateOptions(view, 800, 450));
        expect(element.querySelectorAll("svg svg")).toHaveLength(2);
        expect(firstPoint(element, "1,2")).not.toBeNull();
        expect(firstPoint(element, "4,5")).not.toBeNull();
    });

    it("ignores persisted orientation metadata without replacing the chosen renderer", () => {
        const view = dataView({
            categories: ["A", "B"],
            actual: [12, 20],
            budget: [10, 15]
        });
        setObjects(view, {
            chartSettings: { chartType: "waterfall", orientation: "horizontal" }
        });
        visual.update(updateOptions(view));
        expect(element.querySelector(".waterfall-step")).not.toBeNull();
    });

    it("wires small-multiple points after all cells with global, collision-free indices", async () => {
        const view = dataView({
            categories: ["A", "B", "C", "D"],
            groups: ["North", "North", "South", "South"],
            actual: [10, 20, 30, 40],
            budget: [9, 18, 28, 35]
        });
        visual.update(updateOptions(view, 700, 450));
        expect(element.querySelectorAll("svg svg").length).toBe(2);
        dispatchClick(firstPoint(element, "2"));
        await Promise.resolve();
        expect((harness.select.mock.calls[0][0] as ISelectionId).getKey()).toBe("selection-2");
    });

    it("preserves the small-multiple header offset around each renderer transform", () => {
        const view = dataView({
            categories: ["A", "B"],
            groups: ["North", "South"],
            actual: [10, 20],
            budget: [8, 18]
        });
        setObjects(view, { smallMultiples: { showHeaders: true } });
        visual.update(updateOptions(view, 700, 450));
        const cell = element.querySelector<SVGSVGElement>("svg svg");
        const viewportGroup = cell?.querySelector<SVGGElement>(":scope > g");
        const rendererGroup = viewportGroup?.querySelector<SVGGElement>(":scope > g");
        expect(viewportGroup?.getAttribute("transform")).toMatch(/translate\(0,\s*[1-9]/);
        expect(rendererGroup?.getAttribute("transform")).toMatch(/translate\(/);
    });

    it("keeps right-side small-multiple legend and comments in separate allocations", () => {
        const view = dataView({
            categories: ["A", "B"],
            groups: ["North", "South"],
            comments: ["North note", "South note"],
            actual: [10, 20],
            budget: [8, 18]
        });
        setObjects(view, {
            legend: { show: true, position: "right" },
            commentBox: { show: true }
        });
        visual.update(updateOptions(view, 800, 450));
        const legendTransform = element.querySelector(".legend")?.getAttribute("transform") ?? "";
        const legendX = Number(legendTransform.match(/translate\(([^,]+)/)?.[1]);
        const comment = element.querySelector<SVGForeignObjectElement>("foreignObject.comment-box");
        const commentRight = Number(comment?.getAttribute("x")) + Number(comment?.getAttribute("width"));
        expect(commentRight).toBeLessThanOrEqual(legendX);
    });

    it.each([
        ["line", ["Actual", "Plan", "Previous Year", "Forecast"]],
        ["area", ["Actual", "Plan", "Previous Year", "Forecast"]],
        ["combo", ["Actual", "Plan", "Previous Year", "Forecast"]],
        ["dot", ["Plan", "Actual", "+Variance", "−Variance"]],
        ["lollipop", ["+Variance", "−Variance"]]
    ])("keeps the %s small-multiple legend faithful to rendered series", (chartType, expected) => {
        const view = dataView({
            categories: ["A", "A"],
            groups: ["North", "South"],
            actual: [10, 20],
            budget: [8, 18],
            previousYear: [7, 17],
            forecast: [9, 19]
        });
        setObjects(view, {
            chartSettings: { chartType },
            legend: { show: true, position: "top" }
        });
        visual.update(updateOptions(view, 800, 450));
        const labels = Array.from(element.querySelectorAll(".legend text"), node => node.textContent);
        expect(labels).toEqual(expected);
    });

    it("renders independent local scales and a truly shared mixed-sign scale", () => {
        const view = dataView({
            categories: ["Positive", "Negative", "Positive", "Negative"],
            groups: ["Small", "Small", "Large", "Large"],
            actual: [10, -5, 10_000, -5_000]
        });

        setObjects(view, {
            chartSettings: { chartType: "column" },
            smallMultiples: { scaleMode: "independent" }
        });
        visual.update(updateOptions(view, 800, 450));
        const independentSmall = Number(firstPoint(element, "0").getAttribute("height"));
        const independentLarge = Number(firstPoint(element, "2").getAttribute("height"));
        expect(independentSmall).toBeCloseTo(independentLarge, 5);
        expect(independentSmall / 10).toBeGreaterThan((independentLarge / 10_000) * 100);

        setObjects(view, {
            chartSettings: { chartType: "column" },
            smallMultiples: { scaleMode: "shared" }
        });
        visual.update(updateOptions(view, 800, 450));
        const sharedSmall = Number(firstPoint(element, "0").getAttribute("height"));
        const sharedLarge = Number(firstPoint(element, "2").getAttribute("height"));
        expect(sharedSmall / 10).toBeCloseTo(sharedLarge / 10_000, 5);
    });

    it("labels each small-multiple cell as an accessible group", () => {
        const view = dataView({
            categories: ["A", "A"],
            groups: ["East", "West"],
            actual: [10, 20],
            budget: [8, 18]
        });
        visual.update(updateOptions(view, 800, 450));
        const groups = Array.from(
            element.querySelectorAll<SVGElement>(".chartContainer > svg[role='group']"),
            node => node.getAttribute("aria-label")
        );
        expect(groups).toEqual(["East", "West"]);
    });

    it("does not warn for an exact complete 1,000-row data view", () => {
        const count = 1000;
        const view = dataView({
            categories: Array.from({ length: count }, (_, index) => `C${index}`),
            actual: Array.from({ length: count }, (_, index) => index + 1),
            budget: Array.from({ length: count }, (_, index) => index)
        });
        setObjects(view, { topN: { enable: true, count: 1, showOthers: true } });
        visual.update(updateOptions(view));
        expect(harness.displayWarningIcon).not.toHaveBeenCalled();
        expect(element.querySelector("[data-source-indices*=',']")).not.toBeNull();
    });

    it("warns for host-reduced data and suppresses an incomplete Others aggregate", () => {
        const view = dataView({
            categories: ["A", "B", "C"],
            actual: [30, 20, 10],
            budget: [25, 18, 9]
        });
        view.metadata.segment = {};
        setObjects(view, { topN: { enable: true, count: 1, showOthers: true } });
        visual.update(updateOptions(view));
        expect(harness.displayWarningIcon).toHaveBeenCalledWith(
            "Data reduction applied",
            expect.stringContaining("Power BI reduced")
        );
        expect(element.querySelector("[data-source-indices='1,2']")).toBeNull();
    });

    it("suppresses Others when the author marks a measure non-additive", () => {
        const view = dataView({
            categories: ["A", "B", "C"],
            actual: [30, 20, 10],
            budget: [25, 18, 9]
        });
        setObjects(view, {
            topN: {
                enable: true,
                count: 1,
                aggregation: "nonAdditive",
                showOthers: true
            }
        });
        visual.update(updateOptions(view));
        expect(element.querySelector("[data-source-indices*=',']")).toBeNull();
    });

    it("passes point identity to point context menus and {} to background and aggregate menus", () => {
        const view = dataView({ categories: ["A", "B", "C"], actual: [20, 10, 1], budget: [18, 9, 2] });
        setObjects(view, { topN: { enable: true, count: 1, showOthers: true } });
        visual.update(updateOptions(view));

        firstPoint(element, "0").dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true, cancelable: true, clientX: 12, clientY: 14
        }));
        expect((harness.contextMenu.mock.calls[0][0] as ISelectionId).getKey()).toBe("selection-0");
        expect(harness.contextMenu.mock.calls[0][1]).toEqual({ x: 12, y: 14 });

        firstPoint(element, "1,2").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        element.querySelector("svg")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        expect(harness.contextMenu.mock.calls[1][0]).toEqual({});
        expect(harness.contextMenu.mock.calls[2][0]).toEqual({});
    });

    it("keeps highlight mode selection-only and filter mode JSON-filter-only", async () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element));
        await Promise.resolve();
        expect(harness.select).toHaveBeenCalledTimes(1);
        expect(harness.applyJsonFilter).not.toHaveBeenCalled();

        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        harness.select.mockClear();
        dispatchClick(firstPoint(element));
        expect(harness.select).not.toHaveBeenCalled();
        expect(harness.applyJsonFilter).toHaveBeenCalledWith(
            expect.any(BasicFilter), "general", "filter", 0
        );
    });

    it.each([
        ["numeric", [42], 42],
        ["boolean", [true], true],
        ["date", [new Date("2025-02-03T00:00:00.000Z")], "2025-02-03T00:00:00.000Z"],
        ["text", ["Forty two"], "Forty two"]
    ])("preserves typed %s category filter values", (_name, values, expected) => {
        const view = dataView({ categories: ["placeholder"], actual: [10], budget: [8] });
        const category = view.categorical?.categories?.[0];
        if (!category) throw new Error("category missing");
        category.values = values;
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element));
        const filter = harness.applyJsonFilter.mock.calls[0][0] as BasicFilter;
        expect(filter.values).toEqual([expected]);
    });

    it("toggles filter values off with Ctrl, clears with remove, and honors empty bookmark filters", () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element), { ctrlKey: true });
        dispatchClick(firstPoint(element), { ctrlKey: true });
        expect(harness.applyJsonFilter).toHaveBeenLastCalledWith(
            null, "general", "filter", 1
        );
        visual.update(updateOptions(view, 600, 400, []));
        expect(element.querySelector(".host-selected")).toBeNull();
    });

    it("restores a matching ungrouped BasicFilter bookmark", () => {
        const view = dataView({ categories: ["A", "B"], actual: [10, 20], budget: [8, 18] });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        const bookmark = new BasicFilter(
            { table: "Table", column: "Category" },
            "In",
            ["B"]
        ).toJSON() as unknown as powerbi.IFilter;
        visual.update(updateOptions(view, 600, 400, [bookmark]));
        expect(firstPoint(element, "0").classList.contains("host-selected")).toBe(false);
        expect(firstPoint(element, "1").classList.contains("host-selected")).toBe(true);
    });

    it("clears stale visual filter state when a bookmark contains only unrelated filters", () => {
        const view = dataView({ categories: ["A", "B"], actual: [10, 20], budget: [8, 18] });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        const ownFilter = new BasicFilter(
            { table: "Table", column: "Category" },
            "In",
            ["B"]
        ).toJSON() as unknown as powerbi.IFilter;
        visual.update(updateOptions(view, 600, 400, [ownFilter]));
        expect(firstPoint(element, "1").classList.contains("host-selected")).toBe(true);

        const unrelated = new BasicFilter(
            { table: "Other", column: "Category" },
            "In",
            ["B"]
        ).toJSON() as unknown as powerbi.IFilter;
        visual.update(updateOptions(view, 600, 400, [unrelated]));
        expect(element.querySelector(".host-selected")).toBeNull();
    });

    it("filters grouped duplicate categories as exact category/group tuples", () => {
        const view = dataView({
            categories: ["Same", "Same"],
            groups: ["East", "West"],
            actual: [10, 20],
            budget: [8, 18]
        });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element, "0"));
        dispatchClick(firstPoint(element, "1"), { ctrlKey: true });
        const filter = harness.applyJsonFilter.mock.calls[1][0] as TupleFilter;
        expect(filter).toBeInstanceOf(TupleFilter);
        expect(filter.target).toEqual([
            { table: "Table", column: "Category" },
            { table: "Table", column: "Group" }
        ]);
        expect(filter.values).toEqual([
            [{ value: "Same" }, { value: "East" }],
            [{ value: "Same" }, { value: "West" }]
        ]);

        dispatchClick(firstPoint(element, "0"), { ctrlKey: true });
        const toggled = harness.applyJsonFilter.mock.calls[2][0] as TupleFilter;
        expect(toggled.values).toEqual([[{ value: "Same" }, { value: "West" }]]);
    });

    it("derives the filter target from the last dot of a multi-segment queryName", () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        const category = view.categorical?.categories?.[0];
        if (!category) throw new Error("category missing");
        category.source.queryName = "Model.Sales.Region";
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element));
        const filter = harness.applyJsonFilter.mock.calls[0][0] as BasicFilter;
        expect(filter.target).toEqual({ table: "Model.Sales", column: "Region" });
    });

    it.each([
        ["a queryName without a separator", "Region"],
        ["a leading-dot queryName", ".Region"],
        ["a trailing-dot queryName", "Table."]
    ])("applies no filter and reports an error for %s", (_name, queryName) => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        const category = view.categorical?.categories?.[0];
        if (!category) throw new Error("category missing");
        category.source.queryName = queryName;
        category.source.displayName = "Region";
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        dispatchClick(firstPoint(element));
        expect(harness.applyJsonFilter).not.toHaveBeenCalled();
        expect(element.querySelector('[role="status"]')?.textContent).toContain("could not be completed");
    });

    it("adds and removes every represented grouped tuple through Others", () => {
        const view = dataView({
            categories: ["A", "B", "C", "A", "B", "C"],
            groups: ["East", "East", "East", "West", "West", "West"],
            actual: [30, 20, 10, 300, 200, 100],
            budget: [25, 18, 9, 250, 180, 90]
        });
        setObjects(view, {
            interaction: { crossFilterMode: "filter" },
            topN: { enable: true, count: 1, showOthers: true, sortBy: "value", sortDirection: "desc" }
        });
        visual.update(updateOptions(view, 800, 450));
        const others = firstPoint(element, "1,2");
        dispatchClick(others);
        const filter = harness.applyJsonFilter.mock.calls[0][0] as TupleFilter;
        expect(filter.values).toEqual([
            [{ value: "B" }, { value: "East" }],
            [{ value: "C" }, { value: "East" }]
        ]);
        dispatchClick(others, { ctrlKey: true });
        expect(harness.applyJsonFilter).toHaveBeenLastCalledWith(
            null, "general", "filter", 1
        );
    });

    it("restores only matching tuple bookmark filters and empty arrays clear them", () => {
        const view = dataView({
            categories: ["Same", "Same"],
            groups: ["East", "West"],
            actual: [10, 20],
            budget: [8, 18]
        });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        const bookmark = new TupleFilter(
            [
                { table: "Table", column: "Category" },
                { table: "Table", column: "Group" }
            ],
            "In",
            [[{ value: "Same" }, { value: "West" }]]
        ).toJSON() as unknown as powerbi.IFilter;
        visual.update(updateOptions(view, 600, 400, [bookmark]));
        expect(firstPoint(element, "0").classList.contains("host-selected")).toBe(false);
        expect(firstPoint(element, "1").classList.contains("host-selected")).toBe(true);

        visual.update(updateOptions(view, 600, 400, []));
        expect(element.querySelector(".host-selected")).toBeNull();
    });

    it("rolls back filter state and announces failure when applyJsonFilter throws", () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        setObjects(view, { interaction: { crossFilterMode: "filter" } });
        visual.update(updateOptions(view));
        harness.rejectFilter = true;
        dispatchClick(firstPoint(element));
        expect(element.querySelector(".host-selected")).toBeNull();
        expect(element.querySelector('[role="status"]')?.textContent).toContain("could not be completed");
        expect(element.querySelector('[role="status"]')?.textContent).not.toContain("updated");
    });

    it("handles rejected select and clear promises through a non-sensitive live status", async () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        visual.update(updateOptions(view));
        harness.rejectSelection = true;
        dispatchClick(firstPoint(element));
        await Promise.resolve();
        expect(element.querySelector('[role="status"]')?.textContent).toContain("could not be completed");

        harness.rejectSelection = false;
        harness.selectedIds = [selectionId(0)];
        harness.rejectClear = true;
        element.querySelector("svg")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await Promise.resolve();
        expect(element.querySelector('[role="status"]')?.textContent).toContain("could not be completed");
    });

    it("builds null-safe localized tooltip data and all represented identities", () => {
        const localized = createHostHarness({ locale: "de-DE" });
        element.remove();
        element = document.createElement("div");
        document.body.appendChild(element);
        visual = new Visual({ element, host: localized.host } as VisualConstructorOptions);
        const view = dataView({
            categories: ["A", "B"],
            actual: [1234.5, 2],
            budget: [null, null],
            formats: { actual: "#,0.0", budget: "#,0.0" },
            tooltipMeasures: [{ displayName: "Extra", values: [7, 8], format: "0.0" }]
        });
        setObjects(view, {
            chartSettings: { chartType: "column" },
            topN: { enable: true, count: 0, showOthers: true }
        });
        visual.update(updateOptions(view));
        firstPoint(element, "0,1").dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true, clientX: 20, clientY: 30
        }));
        const tooltip = localized.tooltipShow.mock.calls[0][0];
        expect(tooltip.identities).toHaveLength(2);
        expect(tooltip.dataItems.some((item: { value: string }) => item.value.includes("—"))).toBe(false);
        expect(tooltip.dataItems.map((item: { displayName: string }) => item.displayName)).toEqual([
            "Category", "Actual"
        ]);
        expect(JSON.stringify(tooltip.dataItems)).not.toMatch(/NaN|Infinity/);
    });

    it("uses model formats, every bound comparison, and inverted variance in tooltips and ARIA", () => {
        const view = dataView({
            categories: ["A"],
            actual: [1234.567],
            budget: [1000.111],
            previousYear: [900.22],
            forecast: [1100.333],
            formats: {
                actual: "#,0.000",
                budget: "$#,0.00",
                previousYear: "#,0.0",
                forecast: "#,0.00"
            }
        });
        setObjects(view, {
            chartSettings: {
                chartType: "line",
                comparisonType: "budget",
                invertVariance: true
            },
            dataLabels: { decimalPlaces: 0 }
        });
        visual.update(updateOptions(view));
        const point = firstPoint(element);
        point.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const items = harness.tooltipShow.mock.calls[0][0].dataItems as Array<{
            displayName: string;
            value: string;
        }>;
        expect(items.map(item => item.displayName)).toEqual([
            "Category", "Actual", "Plan", "Previous Year", "Forecast", "Variance to Plan"
        ]);
        expect(items.find(item => item.displayName === "Actual")?.value).toBe("1,234.567");
        expect(items.find(item => item.displayName === "Plan")?.value).toBe("$1,000.11");
        expect(items.find(item => item.displayName === "Variance to Plan")?.value).toContain("-234.456");
        expect(point.getAttribute("aria-label")).toContain("Variance to Plan -234.456");
    });

    it("omits a null Actual from a comparison-only point tooltip and accessible name", () => {
        const view = dataView({
            categories: ["Missing", "Present"],
            actual: [null, 20],
            budget: [10, 15]
        });
        setObjects(view, { chartSettings: { chartType: "column" } });
        visual.update(updateOptions(view));
        const point = firstPoint(element);
        expect(point.getAttribute("aria-label")).toContain("Plan");
        expect(point.getAttribute("aria-label")).not.toMatch(/Actual|—/);
        expect(point.getAttribute("aria-label")).toContain("Variance unavailable");
        point.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const items = harness.tooltipShow.mock.calls[0][0].dataItems as Array<{ displayName: string }>;
        expect(items.map(item => item.displayName)).toEqual(["Category", "Plan", "Variance to Plan"]);
    });

    it("shows only the Actual legend for grouped actual-only column data", () => {
        const view = dataView({
            categories: ["A", "B"],
            groups: ["East", "West"],
            actual: [10, 20]
        });
        setObjects(view, { chartSettings: { chartType: "column" } });
        visual.update(updateOptions(view, 800, 500));
        expect(Array.from(
            element.querySelectorAll(".chartContainer > .legend text"),
            node => node.textContent
        )).toEqual(["Actual"]);
    });

    it("finishes with an honest no-data state when Actual has no finite values", () => {
        const view = dataView({
            categories: ["A", "B", "C"],
            actual: [null, Number.NaN, Number.POSITIVE_INFINITY],
            budget: [1, 2, 3]
        });
        visual.update(updateOptions(view));
        expect(harness.events.slice(-2)).toEqual(["started", "finished"]);
        expect(element.textContent).toContain("finite Actual");
        expect(element.querySelector("[data-source-indices]")).toBeNull();
    });

    it("provides one roving focus target per logical point and complete keyboard activation", async () => {
        const view = dataView({ categories: ["A", "B"], actual: [10, 20], budget: [8, 18] });
        visual.update(updateOptions(view));
        const logical = Array.from(element.querySelectorAll<SVGElement>(".logical-data-point"));
        expect(logical).toHaveLength(2);
        expect(logical.filter(point => point.getAttribute("tabindex") === "0")).toHaveLength(1);
        expect(logical[0].getAttribute("aria-label")).toMatch(/Actual.*Plan.*Variance/);

        logical[0].focus();
        logical[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(logical[1]);
        logical[1].dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, ctrlKey: true }));
        await Promise.resolve();
        expect(harness.select).toHaveBeenCalled();
        logical[1].dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
        expect(harness.contextMenu).toHaveBeenCalled();
    });

    it("supports point drill-down by double-click and keyboard with the original identity", async () => {
        const view = dataView({
            categories: ["A", "B"],
            actual: [10, 20],
            budget: [8, 18]
        });
        visual.update(updateOptions(view));
        const point = firstPoint(element);
        expect(point.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowDown");

        point.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        await Promise.resolve();
        expect((harness.select.mock.calls[0][0] as ISelectionId).getKey()).toBe("selection-0");
        expect(harness.drill).toHaveBeenLastCalledWith({
            roleName: "category",
            drillType: 2
        });

        harness.drill.mockClear();
        point.dispatchEvent(new KeyboardEvent("keydown", {
            key: "ArrowDown",
            altKey: true,
            bubbles: true,
            cancelable: true
        }));
        await Promise.resolve();
        expect(harness.drill).toHaveBeenLastCalledWith({
            roleName: "category",
            drillType: 2
        });
    });

    it("keeps drill-up available after a grouped hierarchy renders", () => {
        const view = dataView({
            categories: ["A", "A"],
            groups: ["North", "South"],
            actual: [10, 20],
            budget: [8, 18]
        });
        view.categorical!.categories![0].source.queryName = "Table.Hierarchy.Level";
        visual.update(updateOptions(view, 700, 450));
        const button = element.querySelector(".drill-up-button");
        expect(button).not.toBeNull();
        dispatchClick(button!);
        expect(harness.drill).toHaveBeenCalledWith({
            roleName: "category",
            drillType: 1
        });
    });

    it("keeps disabled-selection marks readable and focusable without activation semantics", () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        setObjects(view, { interaction: { enableSelection: false, enableDrilldown: false } });
        visual.update(updateOptions(view));
        const point = firstPoint(element);
        expect(point.getAttribute("tabindex")).toBe("0");
        expect(point.getAttribute("role")).toBe("img");
        expect(point.hasAttribute("aria-pressed")).toBe(false);
        dispatchClick(point);
        point.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        point.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
        expect(harness.select).not.toHaveBeenCalled();
        expect(harness.applyJsonFilter).not.toHaveBeenCalled();

        point.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
        expect((harness.contextMenu.mock.calls[0][0] as ISelectionId).getKey()).toBe("selection-0");
    });

    it("honors host allowInteractions while keeping tooltips available", () => {
        harness = createHostHarness({ allowInteractions: false });
        element.remove();
        element = document.createElement("div");
        document.body.appendChild(element);
        visual = new Visual({ element, host: harness.host } as VisualConstructorOptions);
        visual.update(updateOptions(dataView({
            categories: ["A"],
            actual: [10],
            budget: [8]
        })));

        const point = firstPoint(element);
        expect(point.getAttribute("role")).toBe("img");
        dispatchClick(point);
        point.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        point.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        expect(harness.select).not.toHaveBeenCalled();
        expect(harness.applyJsonFilter).not.toHaveBeenCalled();
        expect(harness.contextMenu).not.toHaveBeenCalled();

        point.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        expect(harness.tooltipShow).toHaveBeenCalled();
    });

    it("keeps the populated root focusable and opens a background keyboard context menu", () => {
        visual.update(updateOptions(dataView({
            categories: ["A"],
            actual: [10],
            budget: [8]
        })));
        const root = element.querySelector<SVGSVGElement>("svg.varianceChart");
        expect(root?.getAttribute("tabindex")).toBe("0");
        root?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true,
            cancelable: true
        }));
        expect(harness.contextMenu).toHaveBeenCalledWith({}, expect.any(Object));
    });

    it("removes stale clear-selection controls and interaction state on reset", async () => {
        visual.update(updateOptions(dataView({
            categories: ["A"],
            actual: [10],
            budget: [8]
        })));
        dispatchClick(firstPoint(element));
        await Promise.resolve();
        expect(element.querySelector(".clear-selection-btn")).not.toBeNull();
        visual.update(updateOptions(null));
        expect(element.querySelector(".clear-selection-btn")).toBeNull();
        expect(element.querySelector("[aria-pressed]")).toBeNull();
    });

    it("uses report palette defaults, preserves persisted overrides, and honors high contrast", () => {
        const view = dataView({ categories: ["A"], actual: [10], budget: [8] });
        visual.update(updateOptions(view));
        expect(element.querySelector('[data-source-indices="0"][fill="#123456"]')).not.toBeNull();

        setObjects(view, { design: { actualColor: { solid: { color: "#abcdef" } } } });
        visual.update(updateOptions(view));
        expect(element.querySelector('[data-source-indices="0"][fill="#abcdef"]')).not.toBeNull();

        const highContrastElement = document.createElement("div");
        const highContrastHost = createHostHarness({ highContrast: true });
        const highContrastVisual = new Visual({
            element: highContrastElement,
            host: highContrastHost.host
        } as VisualConstructorOptions);
        highContrastVisual.update(updateOptions(view));
        expect(highContrastElement.querySelector("svg")?.classList.contains("high-contrast")).toBe(true);
        expect(highContrastElement.querySelector('[data-source-indices="0"][fill="#101010"]')).not.toBeNull();
    });

    it("dims non-highlighted rows when Power BI supplies active highlights", () => {
        const view = dataView({
            categories: ["A", "B"],
            actual: [10, 20],
            budget: [8, 18],
            highlights: {
                actual: [10, null],
                budget: [8, null]
            }
        });
        visual.update(updateOptions(view));
        expect(element.querySelectorAll('[data-source-indices="0"].host-highlighted').length).toBeGreaterThan(0);
        expect(element.querySelectorAll('[data-source-indices="1"].host-highlight-dimmed').length).toBeGreaterThan(0);
        expect(element.querySelector('[data-source-indices="1"]')?.style.opacity).toBe("0.3");
    });

    it("forces high-contrast foreground/background through comment descendants", () => {
        const highContrastElement = document.createElement("div");
        const highContrastHost = createHostHarness({ highContrast: true });
        const highContrastVisual = new Visual({
            element: highContrastElement,
            host: highContrastHost.host
        } as VisualConstructorOptions);
        const view = dataView({
            categories: ["A"],
            actual: [10],
            budget: [8],
            comments: ["Readable note"]
        });
        setObjects(view, { commentBox: { show: true } });
        highContrastVisual.update(updateOptions(view, 700, 400));
        const box = highContrastElement.querySelector<HTMLElement>(".comment-box > div");
        expect(box?.style.color).toBe("#101010");
        expect(box?.style.backgroundColor).toBe("#fefefe");
        const descendantStyles = Array.from(
            box?.querySelectorAll<HTMLElement>("*") ?? [],
            node => node.getAttribute("style") ?? ""
        ).join(" ");
        expect(descendantStyles).not.toMatch(/#333|#666|#999|#1a73e8|white/i);
    });

    it("omits unavailable comparison and variance content from actual-only tooltip and ARIA", () => {
        const view = dataView({ categories: ["A"], actual: [123] });
        setObjects(view, { chartSettings: { chartType: "column" } });
        visual.update(updateOptions(view));
        const point = firstPoint(element);
        expect(point.getAttribute("aria-label")).toContain("Actual");
        expect(point.getAttribute("aria-label")).not.toMatch(/Plan|Variance|—/);
        point.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const items = harness.tooltipShow.mock.calls[0][0].dataItems as Array<{ displayName: string; value: string }>;
        expect(items.map(item => item.displayName)).toEqual(["Category", "Actual"]);
        expect(items.some(item => item.value.includes("—"))).toBe(false);
    });

    it.each([
        ["actual only", { categories: ["A"], actual: [1] }],
        ["budget", { categories: ["A"], actual: [1], budget: [2] }],
        ["previous year", { categories: ["A"], actual: [1], previousYear: [2] }],
        ["forecast", { categories: ["A"], actual: [1], forecast: [2] }],
        ["groups only", { categories: ["A"], groups: ["G"], actual: [1] }],
        ["comments only", { categories: ["A"], comments: ["Note"], actual: [1] }]
    ])("handles partial field combination: %s", (_name, input) => {
        expect(() => visual.update(updateOptions(dataView(input)))).not.toThrow();
        expect(harness.events.at(-1)).toBe("finished");
    });

    it("never renders unsafe numeric text or attributes", () => {
        const view = dataView({
            categories: ["A", "B", "C"],
            actual: [Number.NaN, Number.POSITIVE_INFINITY, null],
            budget: [0, Number.NEGATIVE_INFINITY, null]
        });
        visual.update(updateOptions(view));
        expect(element.textContent).not.toMatch(/NaN|Infinity/);
        element.querySelectorAll("*").forEach(node => {
            for (const attribute of node.getAttributeNames()) {
                expect(node.getAttribute(attribute)).not.toMatch(/NaN|Infinity/);
            }
        });
    });
});
