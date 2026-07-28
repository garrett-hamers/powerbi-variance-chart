import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

test.describe("Variance Chart — Preview", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    });

    test("captures full-page screenshot", async ({ page }) => {
        await page.screenshot({
            path: path.resolve(__dirname, "screenshots", "variance-chart-preview.png"),
            fullPage: true
        });
    });

    test("renders 10 chart variants (or error fallbacks)", async ({ page }) => {
        const svgs = await page.locator("svg.varianceChart").count();
        const errs = await page.locator("div:has-text('Error rendering')").count();
        expect(svgs + errs).toBe(10);
    });

    test("each chart type attribute is present", async ({ page }) => {
        const types = await page.$$eval("svg.varianceChart", els =>
            els.map(el => el.getAttribute("data-chart-type"))
        );
        expect(types).toEqual(expect.arrayContaining([
            "variance", "waterfall", "column", "columnStacked", "bar",
            "line", "area", "combo", "dot", "lollipop"
        ]));
    });
});
