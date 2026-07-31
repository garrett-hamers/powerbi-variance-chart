import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

test("reports zero-base percentage variance through the host warning surface", async ({ page }) => {
    await page.goto(previewUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    const warning = await page.evaluate(() => {
        const dataView = JSON.parse(JSON.stringify((window as any).__defaultDataView));
        const budget = dataView.categorical.values.find(
            (column: any) => column.source.roles?.budget === true
        );
        if (budget) budget.values[0] = 0;
        const mountWithHost = (window as any).__mountWithHost;
        mountWithHost("warning", dataView, { width: 640, height: 360 });
        return (window as any).__mockHosts.warning.spies.displayWarningIcon.lastCall()?.args;
    });

    expect(warning.title).toBe("Percentage variance unavailable");
    expect(warning.details).toContain("comparison values are zero");
});
