/**
 * Memoised SVG text measurement.
 *
 * Chart code needs text widths in two hot paths: truncating category labels to a
 * pixel budget, and deciding how many data labels fit without colliding. Both used
 * to be done by mutating a live SVG text node and reading `getComputedTextLength()`,
 * which forces a synchronous layout on every call.
 *
 * This module measures without touching the rendered DOM and caches every result,
 * so repeated renders of the same labels cost one lookup.
 *
 * Three measurement tiers, in order of preference:
 *   1. `powerbi-visuals-utils-formattingutils` textMeasurementService — what Power BI
 *      itself uses. Resolved through `require` because native ESM test runners cannot
 *      resolve this package's extensionless transitive imports (same guard as
 *      src/utils/formatting.ts).
 *   2. A detached canvas 2D context — accurate and layout-free.
 *   3. A deterministic per-character estimate, so tests and headless environments
 *      still produce stable, monotonic widths.
 */

export interface TextStyle {
    fontSize: number;
    fontFamily?: string;
    fontWeight?: string;
}

interface TextProperties {
    text?: string;
    fontFamily: string;
    fontSize: string;
    fontWeight?: string;
}

interface TextMeasurementModule {
    measureSvgTextWidth(textProperties: TextProperties, text?: string): number;
    getTailoredTextOrDefault(textProperties: TextProperties, maxWidth: number): string;
}

declare const require: ((moduleName: string) => TextMeasurementModule) | undefined;

/**
 * Must mirror the `.varianceChart` font stack in style/visual.less, otherwise measured
 * widths will not match rendered widths.
 */
export const DEFAULT_FONT_FAMILY = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";
export const ELLIPSIS = "…";

let measurementService: TextMeasurementModule | undefined;
try {
    measurementService = typeof require === "function"
        ? require("powerbi-visuals-utils-formattingutils/lib/src/textMeasurementService")
        : undefined;
} catch {
    measurementService = undefined;
}

let canvasContext: CanvasRenderingContext2D | null | undefined;

function getCanvasContext(): CanvasRenderingContext2D | null {
    if (canvasContext !== undefined) return canvasContext;
    try {
        canvasContext = typeof document === "undefined"
            ? null
            : document.createElement("canvas").getContext("2d");
    } catch {
        canvasContext = null;
    }
    return canvasContext;
}

/**
 * Relative advance widths for a 1em font, grouped by glyph class. Rough, but stable
 * and monotonic in string length, which is all the fallback path needs.
 */
function estimateWidth(text: string, fontSize: number, bold: boolean): number {
    let ems = 0;
    for (const char of text) {
        if (char === " ") ems += 0.26;
        else if (/[iljI.,;:'`|!]/.test(char)) ems += 0.28;
        else if (/[ft()[\]{}/\\-]/.test(char)) ems += 0.35;
        else if (/[A-Z]/.test(char)) ems += 0.68;
        else if (/[mwMW]/.test(char)) ems += 0.88;
        else if (/[0-9]/.test(char)) ems += 0.55;
        else ems += 0.52;
    }
    return ems * fontSize * (bold ? 1.06 : 1);
}

function styleKey(style: TextStyle): string {
    return `${style.fontSize}|${style.fontFamily ?? DEFAULT_FONT_FAMILY}|${style.fontWeight ?? "normal"}`;
}

const widthCache = new Map<string, number>();
/** Guards against unbounded growth when a report cycles through many distinct labels. */
const MAX_CACHE_ENTRIES = 4000;

function cacheWidth(key: string, width: number): number {
    if (widthCache.size >= MAX_CACHE_ENTRIES) widthCache.clear();
    widthCache.set(key, width);
    return width;
}

function toTextProperties(text: string, style: TextStyle): TextProperties {
    return {
        text,
        fontFamily: style.fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight
    };
}

/** Width in pixels of `text` rendered with `style`. Cached across calls. */
export function measureTextWidth(text: string, style: TextStyle): number {
    if (!text) return 0;
    if (!Number.isFinite(style.fontSize) || style.fontSize <= 0) return 0;

    const key = `${styleKey(style)}|${text}`;
    const cached = widthCache.get(key);
    if (cached !== undefined) return cached;

    const bold = style.fontWeight === "bold" || Number(style.fontWeight) >= 600;

    if (measurementService) {
        try {
            const width = measurementService.measureSvgTextWidth(toTextProperties(text, style));
            if (Number.isFinite(width) && width > 0) return cacheWidth(key, width);
        } catch {
            // Fall through to canvas / estimate.
        }
    }

    const context = getCanvasContext();
    if (context) {
        try {
            context.font = `${bold ? "bold " : ""}${style.fontSize}px ${style.fontFamily ?? DEFAULT_FONT_FAMILY}`;
            const width = context.measureText(text).width;
            if (Number.isFinite(width) && width > 0) return cacheWidth(key, width);
        } catch {
            // Fall through to estimate.
        }
    }

    return cacheWidth(key, estimateWidth(text, style.fontSize, bold));
}

/**
 * Longest prefix of `text` that fits `maxWidth`, with a trailing ellipsis when
 * truncation occurred. Binary search over cached measurements, so this costs
 * O(log n) measurements instead of one forced reflow per dropped character.
 */
export function truncateToWidth(text: string, maxWidth: number, style: TextStyle): string {
    if (!text) return "";
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return text;
    if (measureTextWidth(text, style) <= maxWidth) return text;

    const ellipsisWidth = measureTextWidth(ELLIPSIS, style);
    if (ellipsisWidth > maxWidth) return "";

    const characters = Array.from(text);
    let low = 0;
    let high = characters.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = characters.slice(0, mid).join("");
        if (measureTextWidth(candidate, style) + ellipsisWidth <= maxWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return low <= 0 ? ELLIPSIS : `${characters.slice(0, low).join("")}${ELLIPSIS}`;
}

/**
 * Chooses which label positions to draw so that no two rendered labels overlap.
 *
 * `slots` are the label centres along the collision axis, with `size` being the
 * label's extent on that axis — text width for charts that stack labels
 * horizontally, line height for charts that stack them vertically.
 * `protectedIndices` are kept whenever they physically fit (first/last/min/max), and
 * the remaining labels are thinned from the middle outwards. Returns the indices to draw.
 */
export function resolveLabelCollisions(
    slots: Array<{ index: number; center: number; size: number }>,
    minGap: number,
    protectedIndices: ReadonlySet<number> = new Set()
): number[] {
    if (slots.length === 0) return [];

    const ordered = [...slots].sort((a, b) => a.center - b.center);
    const gap = Number.isFinite(minGap) && minGap > 0 ? minGap : 0;

    const fits = (a: typeof ordered[number], b: typeof ordered[number]): boolean =>
        b.center - b.size / 2 >= a.center + a.size / 2 + gap;

    const accepted: Array<typeof ordered[number]> = [];
    // Protected labels claim space first so thinning never drops an anchor label.
    for (const slot of ordered) {
        if (!protectedIndices.has(slot.index)) continue;
        const previous = accepted[accepted.length - 1];
        if (!previous || fits(previous, slot)) accepted.push(slot);
    }

    for (const slot of ordered) {
        if (protectedIndices.has(slot.index)) continue;
        let position = accepted.length;
        while (position > 0 && accepted[position - 1].center > slot.center) position--;
        const before = accepted[position - 1];
        const after = accepted[position];
        if (before && !fits(before, slot)) continue;
        if (after && !fits(slot, after)) continue;
        accepted.splice(position, 0, slot);
    }

    return accepted.map(slot => slot.index).sort((a, b) => a - b);
}

/** Test seam. Clears memoised widths so measurement tiers can be exercised in isolation. */
export function resetTextMeasurementCache(): void {
    widthCache.clear();
    canvasContext = undefined;
}
