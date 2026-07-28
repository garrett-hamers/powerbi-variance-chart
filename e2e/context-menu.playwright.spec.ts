/**
 * Context-menu conformance test for Variance Chart.
 *
 * Verifies that a right-click on the rendered visual invokes
 * selectionManager.showContextMenu — the contract Power BI requires
 * so the host can display its native data-point / plot-area menu.
 *
 * The spec remounts #variance through the real Visual class so both mouse and
 * keyboard context-menu paths exercise src/visual.ts production handlers.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

const CHART_ROOT = "#variance svg.varianceChart";
const DATA_ELEMENT = "#variance svg.varianceChart rect[data-dp-index]:not([fill='none']), #variance svg.varianceChart circle[data-dp-index]";

async function mountRealVisual(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
        const mountWithHost = (window as any).__mountWithHost;
        const dataView = (window as any).__defaultDataView;
        if (typeof mountWithHost === "function" && dataView) {
            mountWithHost("variance", dataView, { width: 640, height: 360 });
        }
        (window as any).__nativeCtxReached = 0;
        document.addEventListener("contextmenu", (e) => {
            if (!e.defaultPrevented) (window as any).__nativeCtxReached++;
        });
    });
}

test.describe("Variance Chart — context menu conformance", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
        await mountRealVisual(page);
        await page.waitForSelector(DATA_ELEMENT, { timeout: 10000 });
    });

    test("right-click on data element invokes showContextMenu with sensible position", async ({ page }) => {
        const bar = page.locator(DATA_ELEMENT).first();
        await expect(bar).toBeVisible();
        const dispatchResult = await bar.evaluate((el) => {
            const event = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 50,
                clientY: 60,
                button: 2
            });
            const allowed = el.dispatchEvent(event);
            return { allowed, defaultPrevented: event.defaultPrevented };
        });

        const viewport = page.viewportSize()!;
        const result = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.lastCall()?.args);
        const callCount = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.callCount());

        expect(callCount).toBe(1);
        expect(result).toBeTruthy();
        expect(dispatchResult.defaultPrevented).toBe(true);
        expect(dispatchResult.allowed).toBe(false);
        expect(result.position.x).toBeGreaterThan(0);
        expect(result.position.y).toBeGreaterThan(0);
        expect(result.position.x).toBeLessThan(viewport.width);
        expect(result.position.y).toBeLessThan(viewport.height);
        expect(await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.lastCall()?.args.selectionId.hasIdentity())).toBe(true);
    });

    test("right-click on plot background invokes showContextMenu (plot-area menu signal)", async ({ page }) => {
        const svg = page.locator(CHART_ROOT);
        const box = await svg.boundingBox();
        expect(box).not.toBeNull();
        // Click near the top-left corner of the SVG, away from bars.
        await page.mouse.move(box!.x + 2, box!.y + 2);
        await page.mouse.click(box!.x + 2, box!.y + 2, { button: "right" });

        const callCount = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.callCount());
        const last = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.lastCall()?.args);
        expect(callCount).toBe(1);
        expect(last.selectionId).toEqual({});
    });

    test("Shift+F10 keyboard shortcut opens data-point context menu", async ({ page }) => {
        const bar = page.locator(DATA_ELEMENT).first();
        await bar.focus();
        await page.keyboard.press("Shift+F10");

        const callCount = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.callCount());
        const hasIdentity = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.lastCall()?.args.selectionId.hasIdentity());
        expect(callCount).toBe(1);
        expect(hasIdentity).toBe(true);
    });

    test("contextmenu handler calls event.preventDefault (suppresses browser menu)", async ({ page }) => {
        const bar = page.locator(DATA_ELEMENT).first();
        const dispatchResult = await bar.evaluate((el) => {
            const event = new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 70,
                clientY: 80,
                button: 2
            });
            const allowed = el.dispatchEvent(event);
            return { allowed, defaultPrevented: event.defaultPrevented };
        });

        const last = await page.evaluate(() => (window as any).__mockHosts.variance.spies.showContextMenu.lastCall()?.args);
        const nativeReached = await page.evaluate(() => (window as any).__nativeCtxReached);
        expect(last).toBeTruthy();
        expect(dispatchResult.defaultPrevented).toBe(true);
        expect(dispatchResult.allowed).toBe(false);
        // No un-prevented contextmenu events bubbled to document → browser menu suppressed.
        expect(nativeReached).toBe(0);
    });
});
