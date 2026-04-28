import { describe, it, expect } from "vitest";
import {
    createSpy,
    createMockHost,
} from "../../e2e/mocks/host";

describe("createSpy", () => {
    it("records calls and exposes callCount", () => {
        const spy = createSpy<number>();
        expect(spy.callCount()).toBe(0);
        spy.calls.push({ args: 1, timestamp: Date.now() });
        spy.calls.push({ args: 2, timestamp: Date.now() });
        expect(spy.callCount()).toBe(2);
    });

    it("lastCall returns the most recent recorded call", () => {
        const spy = createSpy<string>();
        expect(spy.lastCall()).toBeUndefined();
        spy.calls.push({ args: "a", timestamp: 1 });
        spy.calls.push({ args: "b", timestamp: 2 });
        expect(spy.lastCall()?.args).toBe("b");
    });

    it("reset clears recorded calls", () => {
        const spy = createSpy();
        spy.calls.push({ args: 1, timestamp: 1 });
        spy.reset();
        expect(spy.callCount()).toBe(0);
        expect(spy.lastCall()).toBeUndefined();
    });
});

describe("createMockHost", () => {
    it("returns an object with every required field", () => {
        const host = createMockHost();
        expect(host.instanceId).toBeTypeOf("string");
        expect(host.locale).toBe("en-US");
        expect(host.colorPalette).toBeDefined();
        expect(host.tooltipService).toBeDefined();
        expect(host.eventService).toBeDefined();
        expect(host.createSelectionManager).toBeTypeOf("function");
        expect(host.createSelectionIdBuilder).toBeTypeOf("function");
        expect(host.createLocalizationManager).toBeTypeOf("function");
        expect(host.launchUrl).toBeTypeOf("function");
        expect(host.persistProperties).toBeTypeOf("function");
        expect(host.applyJsonFilter).toBeTypeOf("function");
        expect(host.spies).toBeDefined();
        expect(host.setTheme).toBeTypeOf("function");
        expect(host.fireSelectCallback).toBeTypeOf("function");
        expect(host.getRegisteredSelectCallback).toBeTypeOf("function");
    });

    it("selectionManager.select(id, true) records the call", async () => {
        const host = createMockHost();
        const sm = host.createSelectionManager();
        const id: any = { getKey: () => "id-1" };
        await sm.select(id, true);
        expect(host.spies.select.callCount()).toBe(1);
        const last = host.spies.select.lastCall()!;
        expect(last.args.selectionId).toBe(id);
        expect(last.args.multiSelect).toBe(true);
    });

    it("selectionManager.clear records via clear spy and empties selection", async () => {
        const host = createMockHost();
        const sm = host.createSelectionManager();
        await sm.select({ getKey: () => "k" } as any, false);
        await sm.clear();
        expect(host.spies.clear.callCount()).toBe(1);
        expect(sm.hasSelection()).toBe(false);
    });

    it("showContextMenu records selectionId and position", async () => {
        const host = createMockHost();
        const sm = host.createSelectionManager();
        const id: any = { getKey: () => "ctx" };
        await sm.showContextMenu(id, { x: 10, y: 20 });
        const last = host.spies.showContextMenu.lastCall()!;
        expect(last.args.selectionId).toBe(id);
        expect(last.args.position).toEqual({ x: 10, y: 20 });
    });

    it("fireSelectCallback invokes the registered callback", () => {
        const host = createMockHost();
        const sm = host.createSelectionManager();
        const received: any[] = [];
        sm.registerOnSelectCallback((ids: any[]) => received.push(...ids));
        expect(host.spies.registerOnSelectCallback.callCount()).toBe(1);
        expect(host.getRegisteredSelectCallback()).toBeTypeOf("function");

        const id1: any = { getKey: () => "1" };
        const id2: any = { getKey: () => "2" };
        host.fireSelectCallback([id1, id2]);
        expect(received).toEqual([id1, id2]);
    });

    it("tooltipService.show records to tooltipShow spy", () => {
        const host = createMockHost();
        const payload = { coordinates: [1, 2], isTouchEvent: false, dataItems: [], identities: [] };
        host.tooltipService.show(payload as any);
        expect(host.spies.tooltipShow.callCount()).toBe(1);
        expect(host.spies.tooltipShow.lastCall()?.args).toBe(payload);
        expect(host.tooltipService.enabled()).toBe(true);
    });

    it("tooltipService.hide and move record to respective spies", () => {
        const host = createMockHost();
        host.tooltipService.hide({ isTouchEvent: false, immediately: true } as any);
        host.tooltipService.move({ coordinates: [3, 4] } as any);
        expect(host.spies.tooltipHide.callCount()).toBe(1);
        expect(host.spies.tooltipMove.callCount()).toBe(1);
    });

    it("setTheme swaps palette and isHighContrast flag", () => {
        const host = createMockHost({ isHighContrast: false });
        const cp: any = host.colorPalette;
        expect(cp.isHighContrast).toBe(false);
        expect(cp.foreground.solid.color).toBe("#252423");

        host.setTheme(
            { foreground: "#000000", background: "#FFFFFF", foregroundSelected: "#FF0000", hyperlink: "#00FF00" },
            true,
        );
        expect(cp.isHighContrast).toBe(true);
        expect(cp.foreground.solid.color).toBe("#000000");
        expect(cp.foregroundSelected.solid.color).toBe("#FF0000");
    });

    it("selectionIdBuilder produces deterministic keys for same inputs", () => {
        const host = createMockHost();
        const b1 = host.createSelectionIdBuilder();
        const b2 = host.createSelectionIdBuilder();
        const cat = { source: { queryName: "Table.Cat" } };
        const id1 = b1.withCategory(cat as any, 3).withMeasure("m1").createSelectionId();
        const id2 = b2.withCategory(cat as any, 3).withMeasure("m1").createSelectionId();
        expect((id1 as any).getKey()).toBe((id2 as any).getKey());

        const b3 = host.createSelectionIdBuilder();
        const id3 = b3.withCategory(cat as any, 4).withMeasure("m1").createSelectionId();
        expect((id3 as any).getKey()).not.toBe((id1 as any).getKey());
        expect((id1 as any).equals(id2)).toBe(true);
        expect((id1 as any).equals(id3)).toBe(false);
    });

    it("colorPalette.getColor cycles through a palette and caches by key", () => {
        const host = createMockHost();
        const a1 = (host.colorPalette as any).getColor("A");
        const b1 = (host.colorPalette as any).getColor("B");
        const a2 = (host.colorPalette as any).getColor("A");
        expect(a1.solid.color).toBe(a2.solid.color);
        expect(a1.solid.color).not.toBe(b1.solid.color);
    });

    it("eventService spies fire when invoked", () => {
        const host = createMockHost();
        host.eventService.renderingStarted({} as any);
        host.eventService.renderingFinished({} as any);
        host.eventService.renderingFailed({} as any, "boom");
        expect(host.spies.eventServiceStarted.callCount()).toBe(1);
        expect(host.spies.eventServiceFinished.callCount()).toBe(1);
        expect(host.spies.eventServiceFailed.callCount()).toBe(1);
        expect(host.spies.eventServiceFailed.lastCall()?.args.reason).toBe("boom");
    });

    it("launchUrl, persistProperties and applyJsonFilter record to spies", () => {
        const host = createMockHost();
        host.launchUrl("https://example.com");
        host.persistProperties({ merge: [] } as any);
        host.applyJsonFilter({ k: 1 } as any, "obj", "prop", 0 as any);
        expect(host.spies.launchUrl.lastCall()?.args.url).toBe("https://example.com");
        expect(host.spies.persistProperties.callCount()).toBe(1);
        expect(host.spies.applyJsonFilter.callCount()).toBe(1);
    });

    it("localizationManager.getDisplayName returns the key unchanged", () => {
        const host = createMockHost();
        const lm = host.createLocalizationManager();
        expect(lm.getDisplayName("Visual_Label")).toBe("Visual_Label");
    });
});
