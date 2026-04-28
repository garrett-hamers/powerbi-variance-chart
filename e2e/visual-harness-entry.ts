/**
 * Variance chart harness — exposes window.__mountVisual contract and bootstraps
 * every ChartType (variance, waterfall, column, columnStacked, bar, line, area,
 * combo, dot, lollipop) so the full factory surface is exercised.
 */
import * as d3 from "d3";
import { parseDataView, ParsedData } from "../src/dataParser";
import { createChart, ChartType, ChartSettings, ChartDimensions } from "../src/charts";
import { DEFAULT_IBCS_COLORS } from "../src/utils/colors";
import { createMockHost } from "./mocks/host";
import { Visual as __TooltipVisual } from "../src/visual";
import { createMockHost as __createTooltipMockHost, MockHost as __TooltipMockHost } from "./mocks/host";

export interface MountConfig {
    containerId: string;
    dataView: any;
    settings?: Record<string, any>;
    host?: any;
    dimensions?: { width: number; height: number };
}

export interface MountHandle {
    update: (config: Partial<MountConfig>) => void;
    unmount: () => void;
    getContainer: () => HTMLElement;
}

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function deepMerge<T>(base: T, override: any): T {
    if (!isPlainObject(override)) return base;
    const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
    for (const k of Object.keys(override)) {
        out[k] = isPlainObject(out[k]) && isPlainObject(override[k])
            ? deepMerge(out[k], override[k]) : override[k];
    }
    return out;
}

function defaultSettings(title = ""): ChartSettings {
    return {
        invertVariance: false,
        comparisonType: "budget",
        colors: { ...DEFAULT_IBCS_COLORS },
        title: { show: true, text: title, fontSize: 13, fontColor: "#333", alignment: "center" },
        dataLabels: {
            show: true, showValues: true, showVariance: true, showPercentage: false,
            fontSize: 10, decimalPlaces: 0, displayUnits: "auto" as any,
            negativeFormat: "minus", labelDensity: "firstLast"
        },
        categories: { show: true, fontSize: 11, fontColor: "#333", rotation: 0, maxWidth: 60 },
        legend: { show: true, position: "top", fontSize: 11 },
        commentBox: {
            show: false, showVariance: "both", varianceIcon: "arrow", padding: 8, gap: 6,
            fontSize: 11, fontColor: "#333", markerSize: 6, markerColor: "#888"
        },
        highlighting: { show: false, threshold: 5, highlightPositive: true, highlightNegative: true },
        axisBreak: { show: false, breakValue: 0 },
        showVarianceLabels: true,
        showPercentage: false,
        fontSize: 11,
        fontColor: "#333"
    };
}

function defaultDimensions(w = 420, h = 320): ChartDimensions {
    return {
        width: w, height: h,
        margin: { top: 10, right: 20, bottom: 30, left: 40 },
        layout: {
            chartArea: { x: 40, y: 30, width: w - 60, height: h - 60 },
            titleArea: { x: 0, y: 0, width: w, height: 24 },
            legendArea: { x: 0, y: 24, width: w, height: 18 }
        }
    };
}

export function mountVisual(config: MountConfig): MountHandle {
    const container = document.getElementById(config.containerId);
    if (!container) throw new Error(`Container #${config.containerId} not found`);

    let current: MountConfig = config;

    function render(cfg: MountConfig) {
        container.innerHTML = "";
        const chartType: ChartType = ((cfg.settings as any)?.chartType ?? cfg.containerId) as ChartType;
        try {
            const parsed = parseDataView(cfg.dataView);
            if (!parsed) throw new Error("parseDataView returned null");
            const settings = deepMerge(defaultSettings(), cfg.settings || {});
            const dims = defaultDimensions(cfg.dimensions?.width, cfg.dimensions?.height);

            const svg = d3.select(container).append("svg")
                .attr("width", dims.width).attr("height", dims.height)
                .classed("varianceChart", true)
                .attr("data-chart-type", chartType);
            const g = svg.append("g").classed("chartContainer", true) as any;

            const chart = createChart(chartType, g, parsed as ParsedData, settings, dims);
            chart.render();
        } catch (e) {
            console.error(cfg.containerId, e);
            d3.select(container).append("div").style("color", "red")
                .text("Error rendering " + chartType + ": " + (e as Error).message);
        }
    }

    render(current);

    return {
        update(next) {
            current = { ...current, ...next, settings: deepMerge(current.settings || {}, next.settings || {}) } as MountConfig;
            render(current);
        },
        unmount() { container.innerHTML = ""; },
        getContainer() { return container; }
    };
}

(window as any).__mountVisual = mountVisual;
(window as any).__createMockHost = createMockHost;

/* ───── Bootstrap: all 10 ChartType factory outputs ───── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const actuals = [1200, 1400, 1100, 1600, 1800, 1750, 2100, 2300, 2050, 2400, 2600, 2800];
const budgets = [1300, 1350, 1200, 1500, 1700, 1800, 2000, 2200, 2100, 2300, 2500, 2700];
const py      = [1100, 1250, 1050, 1400, 1650, 1600, 1900, 2100, 2000, 2200, 2400, 2600];

function buildMockDataView(): any {
    return {
        categorical: {
            categories: [
                { source: { displayName: "Month", queryName: "T.Month", roles: { category: true } }, values: MONTHS }
            ],
            values: [
                { source: { displayName: "Actual", queryName: "T.Actual", roles: { actual: true } }, values: actuals },
                { source: { displayName: "Budget", queryName: "T.Budget", roles: { budget: true } }, values: budgets },
                { source: { displayName: "PY", queryName: "T.PY", roles: { previousYear: true } }, values: py }
            ]
        },
        metadata: { columns: [] }
    };
}

const bootstrap: Array<{ id: string; chartType: ChartType; title: string }> = [
    { id: "variance",       chartType: "variance",       title: "Variance (Actual vs Budget)" },
    { id: "waterfall",      chartType: "waterfall",      title: "Waterfall" },
    { id: "column",         chartType: "column",         title: "Column (Actual + Budget)" },
    { id: "columnStacked",  chartType: "columnStacked",  title: "Column Stacked" },
    { id: "bar",            chartType: "bar",            title: "Bar" },
    { id: "line",           chartType: "line",           title: "Line" },
    { id: "area",           chartType: "area",           title: "Area" },
    { id: "combo",          chartType: "combo",          title: "Combo" },
    { id: "dot",            chartType: "dot",            title: "Dot" },
    { id: "lollipop",       chartType: "lollipop",       title: "Lollipop" }
];

const dv = buildMockDataView();
for (const b of bootstrap) {
    mountVisual({
        containerId: b.id,
        dataView: dv,
        settings: { chartType: b.chartType, title: { text: b.title } }
    });
}


/* ─────────────────────────────────────────────────────────────
 * Tooltip-test harness — mounts the REAL Visual class with
 * createMockHost() so tooltipService.show/move/hide are recorded
 * as spy calls. Used exclusively by tooltip.playwright.spec.ts.
 * ───────────────────────────────────────────────────────────── */
(window as any).__mockHosts = (window as any).__mockHosts || {};
(window as any).__mountWithHost = function(
    containerId: string,
    dataView: any,
    opts?: { width?: number; height?: number }
): __TooltipMockHost {
    let el = document.getElementById(containerId);
    if (!el) {
        el = document.createElement("div");
        el.id = containerId;
        el.style.position = "absolute";
        el.style.left = "0";
        el.style.top = "0";
        el.style.width = (opts?.width ?? 640) + "px";
        el.style.height = (opts?.height ?? 360) + "px";
        el.setAttribute("data-tooltip-host", "true");
        document.body.appendChild(el);
    } else {
        el.innerHTML = "";
    }
    const host = __createTooltipMockHost();
    (window as any).__mockHosts[containerId] = host;
    (window as any).__mockVisuals = (window as any).__mockVisuals || {};
    const visual = new __TooltipVisual({ host, element: el } as any);
    (window as any).__mockVisuals[containerId] = visual;
    visual.update({
        dataViews: [dataView],
        viewport: { width: opts?.width ?? 640, height: opts?.height ?? 360 },
        type: 2,
        viewMode: 0,
        editMode: 0,
        isInFocus: false,
        operationKind: 0,
        jsonFilters: []
    } as any);
    return host;
};

// Expose default dataView for selection tests
(window as any).__defaultDataView = buildMockDataView();

(window as any).__visualsReady = true;
document.body.setAttribute("data-rendered", "true");
