import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");
const POINT = "#variance svg.varianceChart .logical-data-point";

async function mountRealVisual(page: import("@playwright/test").Page): Promise<void> {
    await page.goto(previewUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    await page.evaluate(() => {
        const mountWithHost = (window as any).__mountWithHost;
        const dataView = (window as any).__defaultDataView;
        if (typeof mountWithHost === "function" && dataView) {
            mountWithHost("variance", dataView, { width: 640, height: 360 });
        }
    });
    await page.waitForSelector(POINT, { timeout: 10000 });
}

test.describe("Variance Chart — pointer tooltip behavior", () => {
    test("shows and moves a mouse tooltip through the host service", async ({ page }) => {
        await mountRealVisual(page);
        const point = page.locator(POINT).first();
        await point.dispatchEvent("pointerover", { pointerType: "mouse", clientX: 40, clientY: 50 });
        await point.dispatchEvent("pointermove", { pointerType: "mouse", clientX: 45, clientY: 55 });

        const result = await page.evaluate(() => {
            const host = (window as any).__mockHosts.variance;
            return {
                shows: host.spies.tooltipShow.callCount(),
                moves: host.spies.tooltipMove.callCount(),
                isTouchEvent: host.spies.tooltipShow.lastCall()?.args.isTouchEvent,
                itemCount: host.spies.tooltipShow.lastCall()?.args.dataItems?.length
            };
        });
        expect(result.shows).toBe(1);
        expect(result.moves).toBe(1);
        expect(result.isTouchEvent).toBe(false);
        expect(result.itemCount).toBeGreaterThan(0);
    });

    test("delays touch tooltip display and marks it as a touch event", async ({ page }) => {
        await mountRealVisual(page);
        const point = page.locator(POINT).first();
        await point.dispatchEvent("pointerover", { pointerType: "touch", clientX: 40, clientY: 50 });

        await page.waitForTimeout(100);
        expect(await page.evaluate(() => (window as any).__mockHosts.variance.spies.tooltipShow.callCount())).toBe(0);

        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const host = (window as any).__mockHosts.variance;
            return {
                shows: host.spies.tooltipShow.callCount(),
                isTouchEvent: host.spies.tooltipShow.lastCall()?.args.isTouchEvent
            };
        });
        expect(result.shows).toBe(1);
        expect(result.isTouchEvent).toBe(true);
    });

    test("cancels a pending touch tooltip when the pointer leaves", async ({ page }) => {
        await mountRealVisual(page);
        const point = page.locator(POINT).first();
        await point.dispatchEvent("pointerover", { pointerType: "touch", clientX: 40, clientY: 50 });
        await point.dispatchEvent("pointerout", { pointerType: "touch", clientX: 40, clientY: 50 });
        await page.waitForTimeout(600);

        expect(await page.evaluate(() => (window as any).__mockHosts.variance.spies.tooltipShow.callCount())).toBe(0);
    });
});
