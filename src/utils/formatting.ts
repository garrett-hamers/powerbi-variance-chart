/**
 * Formatting utilities for numbers and labels.
 */
import type { IValueFormatter, ValueFormatterOptions } from "powerbi-visuals-utils-formattingutils/lib/src/valueFormatter";

interface PowerBiFormatterModule {
    create(options: ValueFormatterOptions): IValueFormatter;
}

declare const require: ((moduleName: string) => PowerBiFormatterModule) | undefined;

export type NumberScale = "none" | "thousands" | "millions" | "billions" | "auto";

export interface FormatOptions {
    scale: NumberScale;
    decimals: number;
    prefix: string;
    suffix: string;
    showSign: boolean;
    negativeFormat: "minus" | "parentheses";
    format?: string;
    locale?: string;
    /** Finite magnitude used to choose a stable unit when scale is Auto. */
    representativeValue?: number;
}

const DEFAULT_FORMAT: FormatOptions = {
    scale: "auto",
    decimals: 1,
    prefix: "",
    suffix: "",
    showSign: false,
    negativeFormat: "minus"
};

const DISPLAY_UNITS: Record<Exclude<NumberScale, "auto" | "none">, number> = {
    thousands: 1_000,
    millions: 1_000_000,
    billions: 1_000_000_000
};

let powerBiFormatter: PowerBiFormatterModule | undefined;
try {
    powerBiFormatter = typeof require === "function"
        ? require("powerbi-visuals-utils-formattingutils/lib/src/valueFormatter")
        : undefined;
} catch {
    // Native ESM test runners cannot resolve this package's extensionless
    // transitive imports; Power BI's webpack runtime can.
    powerBiFormatter = undefined;
}

function decimalPlacesFromFormat(format?: string): number | undefined {
    if (!format) return undefined;
    const match = format.split(";")[0].match(/\.([0#]+)/);
    return match ? Math.min(20, match[1].length) : undefined;
}

function fallbackFormat(value: number, format?: string, locale?: string, precision?: number): string {
    const requestedDecimals = precision ?? decimalPlacesFromFormat(format);
    const decimals = requestedDecimals === undefined || !Number.isFinite(requestedDecimals)
        ? undefined
        : Math.min(20, Math.max(0, Math.floor(requestedDecimals)));
    const percent = format?.includes("%") ?? false;
    const currencySymbol = format?.match(/[$€£¥]/)?.[0];
    const options: Intl.NumberFormatOptions = {
        useGrouping: format?.includes(",") ?? true
    };
    if (decimals !== undefined) {
        options.minimumFractionDigits = decimals;
        options.maximumFractionDigits = decimals;
    }
    let formatter: Intl.NumberFormat;
    try {
        formatter = new Intl.NumberFormat(locale, options);
    } catch {
        formatter = new Intl.NumberFormat(undefined, options);
    }
    const formatted = formatter.format(percent ? value * 100 : value);
    return `${currencySymbol ?? ""}${formatted}${percent ? "%" : ""}`;
}

function formatWithPowerBi(value: number, options: ValueFormatterOptions): string {
    if (powerBiFormatter) {
        try {
            return powerBiFormatter.create(options).format(value);
        } catch {
            // Fall through to deterministic local formatting for malformed model metadata.
        }
    }
    return fallbackFormat(value, options.format, options.cultureSelector, options.precision);
}

function dateFormatOptions(format?: string): Intl.DateTimeFormatOptions {
    if (!format) {
        return { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" };
    }
    const options: Intl.DateTimeFormatOptions = { timeZone: "UTC" };
    if (/yyyy/i.test(format)) options.year = "numeric";
    else if (/yy/i.test(format)) options.year = "2-digit";
    if (/MMMM/.test(format)) options.month = "long";
    else if (/MMM/.test(format)) options.month = "short";
    else if (/MM/.test(format)) options.month = "2-digit";
    else if (/M/.test(format)) options.month = "numeric";
    if (/dd/.test(format)) options.day = "2-digit";
    else if (/d/.test(format)) options.day = "numeric";
    if (/HH|hh/.test(format)) options.hour = "2-digit";
    if (/mm/.test(format)) options.minute = "2-digit";
    if (/ss/.test(format)) options.second = "2-digit";
    return Object.keys(options).length > 1
        ? options
        : { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" };
}

export function formatPrimitiveValue(
    value: string | number | boolean | Date | null | undefined,
    format?: string,
    locale?: string
): string {
    if (value === null || value === undefined) return "";
    if (powerBiFormatter) {
        try {
            return powerBiFormatter.create({ format, cultureSelector: locale }).format(value);
        } catch {
            // Fall through to safe primitive formatting.
        }
    }
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return "";
        try {
            return new Intl.DateTimeFormat(locale, dateFormatOptions(format)).format(value);
        } catch {
            return new Intl.DateTimeFormat(undefined, dateFormatOptions(format)).format(value);
        }
    }
    if (typeof value === "number") return fallbackFormat(value, format, locale);
    return String(value);
}

export function getDisplayUnit(scale: NumberScale, representativeValue?: number): number | undefined {
    if (scale !== "auto") return scale === "none" ? undefined : DISPLAY_UNITS[scale];
    const magnitude = Math.abs(representativeValue ?? 0);
    if (!Number.isFinite(magnitude)) return undefined;
    if (magnitude >= DISPLAY_UNITS.billions) return DISPLAY_UNITS.billions;
    if (magnitude >= DISPLAY_UNITS.millions) return DISPLAY_UNITS.millions;
    if (magnitude >= DISPLAY_UNITS.thousands) return DISPLAY_UNITS.thousands;
    return undefined;
}

export function formatModelValue(
    value: number | null,
    format?: string,
    locale?: string
): string | null {
    if (value === null || !Number.isFinite(value)) return null;
    return formatWithPowerBi(value, {
        format,
        cultureSelector: locale
    });
}

/**
 * Format a finite number with Power BI's model formatter. Explicit chart-label
 * precision and display units only affect callers that provide those options.
 */
export function formatNumber(
    value: number | null,
    options: Partial<FormatOptions> = {}
): string {
    if (value === null || !Number.isFinite(value)) return "—";
    const opts = { ...DEFAULT_FORMAT, ...options };
    const unit = getDisplayUnit(opts.scale, opts.representativeValue);
    const formatterOptions: ValueFormatterOptions = {
        format: opts.format,
        cultureSelector: opts.locale,
        precision: Math.max(0, Math.floor(opts.decimals)),
        value: unit
    };

    let formatted: string;
    let usedPowerBiFormatter = false;
    if (powerBiFormatter) {
        try {
            formatted = powerBiFormatter.create(formatterOptions).format(value);
            usedPowerBiFormatter = true;
        } catch {
            formatted = fallbackFormat(
                unit ? value / unit : value,
                opts.format,
                opts.locale,
                opts.decimals
            );
        }
    } else {
        formatted = fallbackFormat(
            unit ? value / unit : value,
            opts.format,
            opts.locale,
            opts.decimals
        );
    }
    if (!usedPowerBiFormatter && unit) {
        formatted += unit === DISPLAY_UNITS.thousands ? "K" : unit === DISPLAY_UNITS.millions ? "M" : "B";
    }
    if (opts.scale === "none" && !opts.format) {
        formatted = fallbackFormat(value, "#,0", opts.locale, opts.decimals);
    }

    if (opts.negativeFormat === "parentheses" && value < 0) {
        formatted = `(${formatted.replace("-", "")})`;
    } else if (opts.showSign && value > 0) {
        formatted = `+${formatted}`;
    }
    return `${opts.prefix}${formatted}${opts.suffix}`;
}

export function formatPercent(
    value: number | null,
    decimals: number = 1,
    showSign: boolean = true,
    locale?: string
): string {
    if (value === null || !Number.isFinite(value)) return "—";
    const formatted = fallbackFormat(value, "#,0", locale, decimals);
    return `${showSign && value > 0 ? "+" : ""}${formatted}%`;
}

export function formatVariance(
    value: number | null,
    percentage: number | null,
    showPercentage: boolean = true,
    options: Partial<FormatOptions> = {}
): string {
    const formattedValue = formatNumber(value, { ...options, showSign: true });
    return showPercentage && percentage !== null && Number.isFinite(percentage)
        ? `${formattedValue} (${formatPercent(percentage, 1, true, options.locale)})`
        : formattedValue;
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 1)) + "…";
}
