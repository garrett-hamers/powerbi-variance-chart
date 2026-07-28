/**
 * Performance budgets — powerbi-variance-chart.
 *
 * Measures initial render, large-dataset render, update (re-render),
 * DOM node count, and unmount leak safety against per-visual budgets.
 * Writes per-run metrics to e2e/perf-results.json for downstream reporting.
 *
 * Baseline = yoy.json. Large = large.json fixture.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const REPO = "powerbi-variance-chart";
const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");
const resultsPath = path.resolve(__dirname, "perf-results.json");

const BUDGETS = {
    initialRenderMs: 500,
    largeRenderMs: 2000,
    updateMs: 200,
    domNodeCount: 5000,
    leakMaxNodes: 5
};

const DIMS = {"width":800,"height":400};
const UPDATE_SETTINGS = { title: { show: true, text: "updated" } };

function loadFixture(name: string): any {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures", name), "utf8"));
}

function median(nums: number[]): number {
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

const baselineDV = loadFixture("yoy.json");
const largeDV = loadFixture("large.json");

interface MetricEntry { budget: number; pass: boolean; [k: string]: any; }
const results: {
    repo: string;
    generatedAt?: string;
    budgets: typeof BUDGETS;
    metrics: Record<string, MetricEntry>;
    violations: string[];
} = { repo: REPO, budgets: BUDGETS, metrics: {}, violations: [] };

function record(name: string, value: number, budget: number, extra?: Record<string, any>) {
    const pass = value < budget;
    let existing: typeof results = results;
    if (fs.existsSync(resultsPath)) {
        try { existing = JSON.parse(fs.readFileSync(resultsPath, "utf8")); } catch { /* ignore */ }
    }
    existing.repo = REPO;
    existing.budgets = BUDGETS;
    existing.metrics = existing.metrics || {};
    existing.violations = existing.violations || [];
    existing.metrics[name] = { value, budget, pass, ...(extra || {}) };
    if (!pass) existing.violations.push(`${name}: ${value} >= budget ${budget}`);
    existing.generatedAt = new Date().toISOString();
    fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
    results.metrics[name] = existing.metrics[name];
}



test.describe(`${REPO} — performance budgets`, () => {

    test.beforeAll(() => {
        try { if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath); } catch { /* ignore */ }
    });

    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 15000 });
    });

    test("initial render (baseline) under budget", async ({ page }) => {
        const samples: number[] = [];
        for (let i = 0; i < 3; i++) {
            const ms = await page.evaluate(({ dv, dims }) => {
                const id = "__perf_init_" + Math.random().toString(36).slice(2);
                const div = document.createElement("div");
                div.id = id;
                document.body.appendChild(div);
                const t0 = performance.now();
                const handle = (window as any).__mountVisual({ containerId: id, dataView: dv, dimensions: dims });
                div.setAttribute("data-rendered", "true");
                const dt = performance.now() - t0;
                handle.unmount();
                div.remove();
                return dt;
            }, { dv: baselineDV, dims: DIMS });
            samples.push(ms);
        }
        const med = median(samples);
        record("initialRenderMs", med, BUDGETS.initialRenderMs, { samples });
        expect.soft(med).toBeLessThan(BUDGETS.initialRenderMs);
    });

    test("large dataset render under budget", async ({ page }) => {
        const samples: number[] = [];
        for (let i = 0; i < 3; i++) {
            const ms = await page.evaluate(({ dv, dims }) => {
                const id = "__perf_large_" + Math.random().toString(36).slice(2);
                const div = document.createElement("div");
                div.id = id;
                document.body.appendChild(div);
                const t0 = performance.now();
                const handle = (window as any).__mountVisual({ containerId: id, dataView: dv, dimensions: dims });
                div.setAttribute("data-rendered", "true");
                const dt = performance.now() - t0;
                handle.unmount();
                div.remove();
                return dt;
            }, { dv: largeDV, dims: DIMS });
            samples.push(ms);
        }
        const med = median(samples);
        record("largeRenderMs", med, BUDGETS.largeRenderMs, { samples });
        expect.soft(med).toBeLessThan(BUDGETS.largeRenderMs);
    });

    test("update (re-render) under budget", async ({ page }) => {
        const samples: number[] = [];
        for (let i = 0; i < 3; i++) {
            const ms = await page.evaluate(({ dv, dims, settings }) => {
                const id = "__perf_upd_" + Math.random().toString(36).slice(2);
                const div = document.createElement("div");
                div.id = id;
                document.body.appendChild(div);
                const handle = (window as any).__mountVisual({ containerId: id, dataView: dv, dimensions: dims });
                const t0 = performance.now();
                handle.update({ settings });
                const dt = performance.now() - t0;
                handle.unmount();
                div.remove();
                return dt;
            }, { dv: baselineDV, dims: DIMS, settings: UPDATE_SETTINGS });
            samples.push(ms);
        }
        const med = median(samples);
        record("updateMs", med, BUDGETS.updateMs, { samples });
        expect.soft(med).toBeLessThan(BUDGETS.updateMs);
    });

    test("DOM node count for large fixture under budget", async ({ page }) => {
        const count = await page.evaluate(({ dv, dims }) => {
            const id = "__perf_dom_" + Math.random().toString(36).slice(2);
            const div = document.createElement("div");
            div.id = id;
            document.body.appendChild(div);
            const handle = (window as any).__mountVisual({ containerId: id, dataView: dv, dimensions: dims });
            const n = div.querySelectorAll("*").length;
            handle.unmount();
            div.remove();
            return n;
        }, { dv: largeDV, dims: DIMS });
        record("domNodeCount", count, BUDGETS.domNodeCount);
        expect.soft(count).toBeLessThan(BUDGETS.domNodeCount);
    });

    test("no DOM leak on unmount (10×)", async ({ page }) => {
        const counts = await page.evaluate(({ dv, dims }) => {
            const id = "__perf_leak";
            let div = document.getElementById(id);
            if (!div) {
                div = document.createElement("div");
                div.id = id;
                document.body.appendChild(div);
            }
            const samples: number[] = [];
            for (let i = 0; i < 10; i++) {
                const handle = (window as any).__mountVisual({ containerId: id, dataView: dv, dimensions: dims });
                handle.unmount();
                samples.push(div.querySelectorAll("*").length);
            }
            div.remove();
            return samples;
        }, { dv: baselineDV, dims: DIMS });
        const maxCount = Math.max(...counts);
        record("leakMaxNodes", maxCount, BUDGETS.leakMaxNodes, { samples: counts });
        for (const c of counts) expect.soft(c).toBeLessThan(BUDGETS.leakMaxNodes);
    });

    test.afterAll(async () => {
        results.generatedAt = new Date().toISOString();
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    });
});
