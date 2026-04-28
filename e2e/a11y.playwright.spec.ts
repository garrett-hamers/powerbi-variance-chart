/**
 * Accessibility tests for the Atlyn Variance Chart.
 *
 * Coverage:
 *   1. axe-core scan — fails on critical/serious; documents moderate/minor
 *   2. Tab-order   — asserts at least one data point is keyboard-focusable
 *   3. Focus-visible — asserts focused element has non-default outline/ring
 *   4. ARIA roles   — data points expose role + accessible name
 *   5. aria-label sampling — label contains category / value (best-effort)
 *
 * The visual declares supportsKeyboardFocus: true in capabilities.json, so
 * focusable data points MUST be reachable via Tab and carry role / aria-* attrs.
 */
import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

/* ────────────────────────────────────────────
   Per-repo configuration
   ──────────────────────────────────────────── */
const CONTAINER_ID = "#variance";
const DP_SELECTOR = `${CONTAINER_ID} svg.varianceChart [data-index]`;
const EXPECTED_DPS = 12;
const VISUAL_NAME = "variance-chart";

/* ────────────────────────────────────────────
   Axe loader — CDN (no npm dep required)
   ──────────────────────────────────────────── */
const AXE_CDN = "https://unpkg.com/axe-core@4.10.0/axe.min.js";

async function injectAxe(page: Page): Promise<boolean> {
    try {
        await page.addScriptTag({ url: AXE_CDN });
        return true;
    } catch (err) {
        console.warn(`[a11y] failed to load axe-core from CDN: ${(err as Error).message}`);
        return false;
    }
}

interface AxeResult {
    violations: Array<{ id: string; impact: string; description: string; nodes: unknown[] }>;
}

test.describe(`${VISUAL_NAME} — Accessibility`, () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 }).catch(() => { /* some harnesses do not set flag */ });
        await page.evaluate(() => {
            const mountWithHost = (window as any).__mountWithHost;
            const dataView = (window as any).__defaultDataView;
            if (typeof mountWithHost === "function" && dataView) {
                mountWithHost("variance", dataView, { width: 640, height: 360 });
            }
        });
        await page.waitForSelector(DP_SELECTOR, { timeout: 10000 });
    });

    /* 1. axe-core scan ─────────────────────────── */
    test("axe: no critical or serious violations on baseline fixture", async ({ page }) => {
        const ok = await injectAxe(page);
        test.skip(!ok, "axe-core CDN unreachable — skipping scan");

        const results = (await page.evaluate(async (selector) => {
            // @ts-ignore axe injected globally
            const axe = (window as any).axe;
            const el = document.querySelector(selector);
            return await axe.run(el || document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
            });
        }, CONTAINER_ID)) as AxeResult;

        const byImpact: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, null: 0 };
        for (const v of results.violations) {
            const key = (v.impact || "null");
            byImpact[key] = (byImpact[key] || 0) + 1;
        }
        console.log(`[a11y:${VISUAL_NAME}] axe violations by impact:`, JSON.stringify(byImpact));
        for (const v of results.violations) {
            console.log(`[a11y:${VISUAL_NAME}]   [${v.impact}] ${v.id} — ${v.description} (${v.nodes.length} nodes)`);
        }

        expect(byImpact.critical, "critical axe violations present (P0)").toBe(0);
        expect(byImpact.serious, "serious axe violations present (P0)").toBe(0);
    });

    /* 2. Tab order ─────────────────────────────── */
    test("keyboard: at least one data point is reachable via Tab", async ({ page }) => {
        await page.evaluate(() => { document.body.focus(); (document.activeElement as HTMLElement)?.blur(); });
        await page.evaluate(() => window.scrollTo(0, 0));

        const MAX_TABS = 50;
        let stopsVisited = 0;
        let reachedDataPoint = false;

        for (let i = 0; i < MAX_TABS; i++) {
            await page.keyboard.press("Tab");
            stopsVisited++;
            const hit = await page.evaluate((sel) => {
                const active = document.activeElement as HTMLElement | null;
                if (!active) return false;
                return active.matches(sel) || !!active.closest(sel);
            }, DP_SELECTOR);
            if (hit) { reachedDataPoint = true; break; }
        }

        console.log(`[a11y:${VISUAL_NAME}] tab-stops visited: ${stopsVisited} / max ${MAX_TABS}; expected DPs: ${EXPECTED_DPS}; reachedDataPoint: ${reachedDataPoint}`);
        expect(reachedDataPoint, `no data point focused after ${MAX_TABS} Tab presses`).toBe(true);
    });

    /* 3. Focus visible ────────────────────────── */
    test("keyboard: focused data point has a visible focus indicator", async ({ page }) => {
        const first = page.locator(DP_SELECTOR).first();
        await first.evaluate((el) => (el as SVGElement).focus({ preventScroll: true } as FocusOptions));

        const style = await first.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
                outlineStyle: cs.outlineStyle,
                outlineWidth: cs.outlineWidth,
                outlineColor: cs.outlineColor,
                boxShadow: cs.boxShadow,
                stroke: cs.stroke,
                strokeWidth: cs.strokeWidth,
            };
        });
        console.log(`[a11y:${VISUAL_NAME}] focus style:`, JSON.stringify(style));

        const hasFocusRing =
            (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
            (style.boxShadow && style.boxShadow !== "none");
        expect(hasFocusRing, `data point has no visible focus ring (outline:${style.outlineStyle}/${style.outlineWidth}, boxShadow:${style.boxShadow})`).toBe(true);
    });

    /* 4. ARIA roles + accessible name ─────────── */
    test("aria: data points have role and accessible name", async ({ page }) => {
        const sample = await page.locator(DP_SELECTOR).first().evaluate((el) => ({
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
            ariaLabelledby: el.getAttribute("aria-labelledby"),
            tabindex: el.getAttribute("tabindex"),
            text: (el.textContent || "").trim(),
        }));
        console.log(`[a11y:${VISUAL_NAME}] first data point attrs:`, JSON.stringify(sample));

        const allowedRoles = ["img", "button", "listitem", "figure", "graphics-symbol", "graphics-object"];
        expect(sample.role, "data point missing role attribute").not.toBeNull();
        expect(allowedRoles, `data point role=${sample.role} is not in expected set`).toContain(sample.role);

        const hasName = !!(sample.ariaLabel || sample.ariaLabelledby || sample.text);
        expect(hasName, "data point has no accessible name (aria-label / labelledby / text)").toBe(true);
    });

    /* 5. Screen-reader label content (best-effort) ── */
    test("aria-label contains category + value (sampled)", async ({ page }) => {
        const dps = page.locator(DP_SELECTOR);
        const total = await dps.count();
        const sampleSize = Math.min(3, total);
        const reports: Array<{ idx: number; label: string | null }> = [];
        for (let i = 0; i < sampleSize; i++) {
            const label = await dps.nth(i).getAttribute("aria-label");
            reports.push({ idx: i, label });
        }
        console.log(`[a11y:${VISUAL_NAME}] aria-label samples:`, JSON.stringify(reports));

        const missing = reports.filter((r) => !r.label).length;
        expect(missing, `${missing}/${sampleSize} sampled data points missing aria-label`).toBe(0);

        for (const r of reports) {
            const hasLetter = /[A-Za-z]/.test(r.label || "");
            const hasDigit = /\d/.test(r.label || "");
            expect(hasLetter && hasDigit, `aria-label "${r.label}" should include both category name and numeric value`).toBe(true);
        }
    });
});
