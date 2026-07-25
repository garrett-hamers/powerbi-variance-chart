/**
 * @vitest-environment node
 *
 * Finding C coverage.
 *
 * In production (webpack) `src/utils/formatting.ts` resolves
 * `powerbi-visuals-utils-formattingutils`' valueFormatter through `require`, so
 * every value is formatted by the real Power BI model formatter and the
 * `usedPowerBiFormatter` display-unit branch runs. Under vitest's native ESM the
 * real module cannot even be evaluated (its transitive imports are extensionless),
 * and Vite injects a Node `createRequire`, so neither a global stub nor `vi.mock`
 * intercepts the `require()` call — every other suite therefore only ever exercises
 * the Intl `fallbackFormat` path.
 *
 * Here we resolve that specifier to its real file path and seed Node's CJS
 * `require.cache` with a controllable stub BEFORE importing formatting.ts. The
 * module's own `require(specifier)` then returns our stub, so `powerBiFormatter`
 * is bound and the PRODUCTION branch is exercised — including the K/M/B
 * `usedPowerBiFormatter` handling. A mutable delegate lets each test drive the
 * model formatter's behaviour.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

interface FormatterOptions {
    format?: string;
    cultureSelector?: string;
    precision?: number;
    value?: number;
}

type FormatFn = (value: number | string | Date) => string;
type CreateImpl = (options: FormatterOptions) => { format: FormatFn };

const SPECIFIER = "powerbi-visuals-utils-formattingutils/lib/src/valueFormatter";
const defaultCreate: CreateImpl = () => ({ format: value => String(value) });
const state: { create: CreateImpl } = { create: defaultCreate };

const nodeRequire = createRequire(join(process.cwd(), "package.json"));
let resolvedPath = "";
let formatting: typeof import("../src/utils/formatting");

beforeAll(async () => {
    resolvedPath = nodeRequire.resolve(SPECIFIER);
    nodeRequire.cache[resolvedPath] = {
        id: resolvedPath,
        filename: resolvedPath,
        loaded: true,
        exports: { create: (options: FormatterOptions) => state.create(options) }
    } as unknown as NodeModule;
    vi.resetModules();
    formatting = await import("../src/utils/formatting");
});

afterEach(() => {
    state.create = defaultCreate;
});

afterAll(() => {
    if (resolvedPath) delete nodeRequire.cache[resolvedPath];
});

describe("formatting production branch (real powerBiFormatter path)", () => {
    it("routes formatNumber through the require-resolved model formatter", () => {
        const create = vi.fn<CreateImpl>(options => ({
            format: value => `PBI[fmt=${options.format ?? ""}|unit=${options.value ?? 0}|p=${options.precision ?? 0}](${value})`
        }));
        state.create = create;

        const out = formatting.formatNumber(1234.567, { format: "$#,0.00", decimals: 2, scale: "none" });

        // If the module had fallen back to the Intl path, create would never run
        // and the output would be a plain "$1,234.57" instead of the PBI marker.
        expect(create).toHaveBeenCalledTimes(1);
        expect(out).toBe("PBI[fmt=$#,0.00|unit=0|p=2](1234.567)");
    });

    it("lets the model formatter own display units and skips the manual K/M/B suffix", () => {
        // usedPowerBiFormatter === true in production, so formatting.ts:202-204 must
        // NOT append a unit letter itself — the model formatter has already scaled.
        const create = vi.fn<CreateImpl>(options => ({
            format: value => (Number(value) / (options.value || 1)).toFixed(options.precision ?? 0)
        }));
        state.create = create;

        const out = formatting.formatNumber(1_500_000, { scale: "millions", decimals: 1 });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ value: 1_000_000, precision: 1 }));
        expect(out).toBe("1.5");
        expect(out).not.toMatch(/[KMB]$/);
    });

    it("appends the K/M/B suffix only when the model formatter throws on malformed metadata", () => {
        // Reachable only when powerBiFormatter is defined (production): create/format
        // throws, formatNumber catches, and the manual suffix path (line 202-204) runs.
        state.create = () => ({ format: () => { throw new Error("malformed model metadata"); } });

        const out = formatting.formatNumber(1_500_000, { scale: "millions", decimals: 1, locale: "en-US" });

        expect(out).toBe("1.5M");
    });

    it("routes formatModelValue and formatPrimitiveValue through the model formatter", () => {
        state.create = () => ({ format: value => `PBI(${value})` });

        expect(formatting.formatModelValue(42, "#,0")).toBe("PBI(42)");
        expect(formatting.formatPrimitiveValue("hello")).toBe("PBI(hello)");
    });
});
