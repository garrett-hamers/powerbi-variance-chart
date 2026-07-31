import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

test.describe("Variance Chart — on-object formatting", () => {
    test("exposes subselectable title and data-point regions", async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
        await page.evaluate(() => {
            const mountWithHost = (window as any).__mountWithHost;
            const dataView = (window as any).__defaultDataView;
            if (typeof mountWithHost === "function" && dataView) {
                mountWithHost("variance", dataView, { width: 640, height: 360 });
            }
            const visual = (window as any).__mockVisuals?.variance;
            if (visual && dataView) {
                visual.update({
                    dataViews: [dataView],
                    viewport: { width: 640, height: 360 },
                    type: 2,
                    formatMode: true,
                    subSelections: [],
                    viewMode: 0,
                    editMode: 1,
                    isInFocus: false,
                    operationKind: 0,
                    jsonFilters: []
                });
            }
        });

        const result = await page.evaluate(() => {
            const visual = (window as any).__mockVisuals?.variance;
            const api = visual?.visualOnObjectFormatting;
            const subSelectables = api?.getSubSelectables?.(3) ?? [];
            const titleStyles = api?.getSubSelectionStyles?.([{
                customVisualObjects: [{ objectName: "title" }],
                displayName: "Title",
                subSelectionType: 3,
                selectionOrigin: { x: 0, y: 0 },
                showUI: true
            }]);
            return {
                hasApi: !!api,
                regions: subSelectables.length,
                markedElements: document.querySelectorAll("[data-sub-selection-object-name]").length,
                titleFill: titleStyles?.fill?.reference
            };
        });

        expect(result.hasApi).toBe(true);
        expect(result.regions).toBeGreaterThan(0);
        expect(result.markedElements).toBeGreaterThan(0);
        expect(result.titleFill).toEqual({ objectName: "title", propertyName: "fontColor" });
    });
});
