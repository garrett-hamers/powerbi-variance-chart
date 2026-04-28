/**
 * Mock IVisualHost with call-spies for Phase-4 Power BI visual tests.
 *
 * Keep this file dependency-free beyond `powerbi-visuals-api` types.
 * Used by both Playwright harnesses (e2e/) and vitest unit tests (test/mocks/).
 */
import powerbi from "powerbi-visuals-api";

/* ------------------------------------------------------------------ */
/* Spies                                                              */
/* ------------------------------------------------------------------ */

export interface SpyCall<T = any> {
    args: T;
    timestamp: number;
}

export interface Spy<T = any> {
    calls: SpyCall<T>[];
    callCount: () => number;
    lastCall: () => SpyCall<T> | undefined;
    reset: () => void;
}

export function createSpy<T = any>(): Spy<T> {
    const calls: SpyCall<T>[] = [];
    return {
        calls,
        callCount: () => calls.length,
        lastCall: () => (calls.length ? calls[calls.length - 1] : undefined),
        reset: () => {
            calls.length = 0;
        },
    };
}

function record<T>(spy: Spy<T>, args: T): void {
    spy.calls.push({ args, timestamp: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Public types                                                       */
/* ------------------------------------------------------------------ */

export interface MockHostSpies {
    select: Spy<{ selectionId: any; multiSelect: boolean }>;
    showContextMenu: Spy<{ selectionId: any; position: { x: number; y: number } }>;
    registerOnSelectCallback: Spy<{ callback: Function }>;
    clear: Spy;
    tooltipShow: Spy<any>;
    tooltipHide: Spy<any>;
    tooltipMove: Spy<any>;
    launchUrl: Spy<{ url: string }>;
    persistProperties: Spy<any>;
    applyJsonFilter: Spy<any>;
    eventServiceStarted: Spy;
    eventServiceFinished: Spy;
    eventServiceFailed: Spy<{ reason?: string }>;
}

export interface MockPalette {
    foreground: string;
    background: string;
    foregroundSelected: string;
    hyperlink: string;
    [k: string]: string;
}

export interface MockHost extends powerbi.extensibility.visual.IVisualHost {
    spies: MockHostSpies;
    setTheme: (palette: MockPalette, isHighContrast?: boolean) => void;
    fireSelectCallback: (ids: powerbi.visuals.ISelectionId[]) => void;
    getRegisteredSelectCallback: () => Function | undefined;
}

export interface CreateMockHostOptions {
    isHighContrast?: boolean;
    palette?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Default palette                                                    */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE: MockPalette = {
    foreground: "#252423",
    background: "#FFFFFF",
    foregroundSelected: "#1F639E",
    hyperlink: "#0078D4",
};

const DEFAULT_COLORS = [
    "#01B8AA", "#374649", "#FD625E", "#F2C80F", "#5F6B6D",
    "#8AD4EB", "#FE9666", "#A66999", "#3599B8", "#DFBFBF",
];

/* ------------------------------------------------------------------ */
/* Deterministic selection id builder                                 */
/* ------------------------------------------------------------------ */

interface BuilderState {
    categories: string[];
    measures: string[];
    series: string[];
}

function stableKey(state: BuilderState): string {
    return JSON.stringify({
        c: state.categories,
        m: state.measures,
        s: state.series,
    });
}

function createSelectionIdBuilder(): powerbi.visuals.ISelectionIdBuilder {
    const state: BuilderState = { categories: [], measures: [], series: [] };
    const builder: any = {
        withCategory(categoryColumn: any, index?: number) {
            const name = categoryColumn?.source?.queryName ?? categoryColumn?.source?.displayName ?? "cat";
            state.categories.push(`${name}:${index ?? 0}`);
            return builder;
        },
        withMeasure(measureId: string) {
            state.measures.push(String(measureId ?? ""));
            return builder;
        },
        withSeries(seriesColumn: any, valueColumn?: any) {
            const name = seriesColumn?.source?.queryName
                ?? valueColumn?.source?.queryName
                ?? valueColumn?.source?.displayName
                ?? "ser";
            state.series.push(String(name));
            return builder;
        },
        withMatrixNode() {
            return builder;
        },
        withTable() {
            return builder;
        },
        createSelectionId(): powerbi.visuals.ISelectionId {
            const key = stableKey(state);
            return {
                equals(other: any): boolean {
                    return !!other && typeof other.getKey === "function" && other.getKey() === key;
                },
                includes(): boolean {
                    return false;
                },
                getKey(): string {
                    return key;
                },
                getSelector(): any {
                    return { data: [key] };
                },
                hasIdentity(): boolean {
                    return state.categories.length + state.measures.length + state.series.length > 0;
                },
            } as any;
        },
    };
    return builder;
}

/* ------------------------------------------------------------------ */
/* createMockHost                                                     */
/* ------------------------------------------------------------------ */

export function createMockHost(options?: CreateMockHostOptions): MockHost {
    const spies: MockHostSpies = {
        select: createSpy(),
        showContextMenu: createSpy(),
        registerOnSelectCallback: createSpy(),
        clear: createSpy(),
        tooltipShow: createSpy(),
        tooltipHide: createSpy(),
        tooltipMove: createSpy(),
        launchUrl: createSpy(),
        persistProperties: createSpy(),
        applyJsonFilter: createSpy(),
        eventServiceStarted: createSpy(),
        eventServiceFinished: createSpy(),
        eventServiceFailed: createSpy(),
    };

    let currentPalette: MockPalette = { ...DEFAULT_PALETTE, ...(options?.palette ?? {}) };
    let highContrast = !!options?.isHighContrast;
    let registeredSelectCallback: Function | undefined;
    const selectedIds: powerbi.visuals.ISelectionId[] = [];

    /* colorPalette */
    let colorIndex = 0;
    const colorCache = new Map<string, powerbi.IFill>();
    const makeFill = (solid: string): powerbi.IFill => ({ solid: { color: solid } } as any);

    const colorPalette: any = {
        getColor(key: string): powerbi.IFill {
            const cacheKey = String(key);
            const cached = colorCache.get(cacheKey);
            if (cached) return cached;
            const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
            colorIndex++;
            const fill = makeFill(color);
            colorCache.set(cacheKey, fill);
            return fill;
        },
        reset() {
            colorIndex = 0;
            colorCache.clear();
            return this;
        },
        get isHighContrast() {
            return highContrast;
        },
        get foreground() {
            return makeFill(currentPalette.foreground);
        },
        get foregroundSelected() {
            return makeFill(currentPalette.foregroundSelected);
        },
        get background() {
            return makeFill(currentPalette.background);
        },
        get hyperlink() {
            return makeFill(currentPalette.hyperlink);
        },
        get foregroundButton() {
            return makeFill(currentPalette.foreground);
        },
        get backgroundLight() {
            return makeFill(currentPalette.background);
        },
        get backgroundNeutral() {
            return makeFill(currentPalette.background);
        },
        get shapes() {
            return makeFill(currentPalette.foreground);
        },
    };

    /* tooltipService */
    const tooltipService: powerbi.extensibility.ITooltipService = {
        enabled: () => true,
        show: (options: any) => record(spies.tooltipShow, options),
        hide: (options: any) => record(spies.tooltipHide, options),
        move: (options: any) => record(spies.tooltipMove, options),
    } as any;

    /* selectionManager */
    const selectionManager: any = {
        select(selectionId: any, multiSelect?: boolean) {
            record(spies.select, { selectionId, multiSelect: !!multiSelect });
            if (multiSelect) {
                selectedIds.push(selectionId);
            } else {
                selectedIds.length = 0;
                if (selectionId) selectedIds.push(selectionId);
            }
            return Promise.resolve(selectedIds.slice());
        },
        hasSelection(): boolean {
            return selectedIds.length > 0;
        },
        clear(): Promise<void> {
            record(spies.clear, undefined);
            selectedIds.length = 0;
            return Promise.resolve();
        },
        showContextMenu(selectionId: any, position: { x: number; y: number }): Promise<void> {
            record(spies.showContextMenu, { selectionId, position });
            return Promise.resolve();
        },
        registerOnSelectCallback(callback: Function): void {
            record(spies.registerOnSelectCallback, { callback });
            registeredSelectCallback = callback;
        },
        getSelectionIds(): any[] {
            return selectedIds.slice();
        },
        applySelectionFilter(): void { /* noop */ },
        registerOnSelectionChanged(): void { /* noop */ },
    };

    /* eventService */
    const eventService: powerbi.extensibility.IVisualEventService = {
        renderingStarted: (_options: any) => record(spies.eventServiceStarted, undefined),
        renderingFinished: (_options: any) => record(spies.eventServiceFinished, undefined),
        renderingFailed: (_options: any, reason?: string) => record(spies.eventServiceFailed, { reason }),
    } as any;

    /* localizationManager */
    const localizationManager: powerbi.extensibility.ILocalizationManager = {
        getDisplayName: (key: string) => key,
    };

    /* hostCapabilities / authenticationService stubs */
    const hostCapabilities: any = {
        allowInteractions: true,
    };

    const host: any = {
        instanceId: "mock-visual-instance-0001",
        locale: "en-US",
        hostCapabilities,
        colorPalette,
        tooltipService,
        eventService,
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => createSelectionIdBuilder(),
        createLocalizationManager: () => localizationManager,
        launchUrl: (url: string) => record(spies.launchUrl, { url }),
        persistProperties: (changes: any) => record(spies.persistProperties, changes),
        applyJsonFilter: (filter: any, objectName: string, propertyName: string, action: any) =>
            record(spies.applyJsonFilter, { filter, objectName, propertyName, action }),
        refreshHostData: () => { /* noop */ },
        displayWarningIcon: () => { /* noop */ },
        fetchMoreData: () => false,
        switchFocusModeState: () => { /* noop */ },
        openModalDialog: () => Promise.resolve({}),
        downloadService: {
            exportVisualsContent: () => Promise.resolve(true),
            exportVisualsContentExtended: () => Promise.resolve({} as any),
        },
        storageService: {
            get: () => Promise.reject("not-implemented"),
            set: () => Promise.resolve(0),
            remove: () => { /* noop */ },
        },
        storageV2Service: {
            get: () => Promise.reject("not-implemented"),
            set: () => Promise.resolve(0),
            remove: () => Promise.resolve(),
        },
        acquireAADTokenService: {
            acquireAADToken: () => Promise.resolve({} as any),
        },
        webAccessService: {
            webAccessStatus: () => Promise.resolve(0 as any),
        },
        authenticationService: {
            getAADToken: () => Promise.resolve(""),
        },
        telemetry: {
            trace: () => { /* noop */ },
        },

        /* mock-only extensions */
        spies,
        setTheme(palette: MockPalette, isHighContrast?: boolean) {
            currentPalette = { ...currentPalette, ...palette };
            if (typeof isHighContrast === "boolean") highContrast = isHighContrast;
            colorCache.clear();
            colorIndex = 0;
        },
        fireSelectCallback(ids: powerbi.visuals.ISelectionId[]) {
            if (registeredSelectCallback) registeredSelectCallback(ids);
        },
        getRegisteredSelectCallback() {
            return registeredSelectCallback;
        },
    };

    return host as MockHost;
}
