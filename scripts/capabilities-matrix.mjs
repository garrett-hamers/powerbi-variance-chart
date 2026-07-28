// capabilities.json -> property matrix generator
// Plain ESM (Node 18+). No external deps.
//
// Reads ./capabilities.json (and optionally ./pbiviz.json) from cwd,
// writes ./e2e/fixtures/capabilities-matrix.json.
//
// Also exported: buildMatrix(capabilitiesJsonPath, pbivizJsonPath?)
// for unit testing.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, basename, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{
 *   objectName: string,
 *   propertyName: string,
 *   type: "bool"|"text"|"numeric"|"integer"|"color"|"enumeration"|"filter"|"formatting"|"unknown",
 *   displayName?: string,
 *   description?: string,
 *   defaultValue?: string|number|boolean|null,
 *   enumValues?: { value: string, displayName?: string }[],
 *   isFilter: boolean
 * }} PropertyEntry
 */

/**
 * Detect the PBI property type from a `type` object in capabilities.json.
 * @param {any} typeObj
 * @returns {{ type: PropertyEntry["type"], enumValues?: any[] }}
 */
export function detectType(typeObj) {
    if (!typeObj || typeof typeObj !== "object") {
        return { type: "unknown" };
    }
    if (typeObj.bool === true) return { type: "bool" };
    if (typeObj.text === true) return { type: "text" };
    if (typeObj.numeric === true) return { type: "numeric" };
    if (typeObj.integer === true) return { type: "integer" };
    if (typeObj.filter === true || typeObj.filter) return { type: "filter" };
    if (typeObj.fill && typeObj.fill.solid && typeObj.fill.solid.color) {
        return { type: "color" };
    }
    if (Array.isArray(typeObj.enumeration)) {
        return {
            type: "enumeration",
            enumValues: typeObj.enumeration.map((e) => ({
                value: String(e.value),
                displayName: e.displayName,
            })),
        };
    }
    if (typeObj.formatting && typeof typeObj.formatting === "object") {
        return { type: "formatting" };
    }
    return { type: "unknown" };
}

/**
 * Extract a reasonable default value if declared inline in capabilities.json.
 * capabilities.json usually doesn't carry defaults; those live in settings.ts.
 * Accepts `default`, `defaultValue`, or `value`.
 * @param {any} prop
 */
function extractDefault(prop) {
    if (prop == null) return null;
    if (Object.prototype.hasOwnProperty.call(prop, "default")) return prop.default;
    if (Object.prototype.hasOwnProperty.call(prop, "defaultValue")) return prop.defaultValue;
    if (Object.prototype.hasOwnProperty.call(prop, "value")) return prop.value;
    return null;
}

/**
 * Build the capabilities matrix from given files.
 * @param {string} capabilitiesJsonPath
 * @param {string} [pbivizJsonPath]
 * @returns {object}
 */
export function buildMatrix(capabilitiesJsonPath, pbivizJsonPath) {
    const warnings = [];
    const capabilities = JSON.parse(readFileSync(capabilitiesJsonPath, "utf8"));

    let visualName = basename(dirname(resolve(capabilitiesJsonPath)));
    let apiVersion = "";
    if (pbivizJsonPath && existsSync(pbivizJsonPath)) {
        try {
            const pbiviz = JSON.parse(readFileSync(pbivizJsonPath, "utf8"));
            if (pbiviz.visual && pbiviz.visual.name) visualName = pbiviz.visual.name;
            if (pbiviz.apiVersion) apiVersion = pbiviz.apiVersion;
        } catch (err) {
            warnings.push(`Failed to read pbiviz.json: ${err.message}`);
        }
    }

    const dataRoles = Array.isArray(capabilities.dataRoles)
        ? capabilities.dataRoles.map((r) => ({
              name: r.name,
              displayName: r.displayName,
              kind: r.kind,
              requiredTypes: r.requiredTypes,
          }))
        : [];

    const conditions = [];
    if (Array.isArray(capabilities.dataViewMappings)) {
        for (const m of capabilities.dataViewMappings) {
            if (Array.isArray(m.conditions)) {
                for (const c of m.conditions) conditions.push(c);
            }
        }
    }

    const supports = {
        highlight: capabilities.supportsHighlight,
        keyboardFocus: capabilities.supportsKeyboardFocus,
        landingPage: capabilities.supportsLandingPage,
        multiVisualSelection: capabilities.supportsMultiVisualSelection,
        synchronizingFilterState: capabilities.supportsSynchronizingFilterState,
        drilldown: capabilities.drilldown,
        tooltipsDefault: capabilities.tooltips && capabilities.tooltips.supportedTypes
            ? !!capabilities.tooltips.supportedTypes.default
            : undefined,
        tooltipsCanvas: capabilities.tooltips && capabilities.tooltips.supportedTypes
            ? !!capabilities.tooltips.supportedTypes.canvas
            : undefined,
        sorting: capabilities.sorting ? true : undefined,
    };

    /** @type {PropertyEntry[]} */
    const properties = [];
    const objects = capabilities.objects || {};
    for (const objectName of Object.keys(objects)) {
        const obj = objects[objectName];
        const props = obj && obj.properties ? obj.properties : {};
        for (const propertyName of Object.keys(props)) {
            const prop = props[propertyName];
            const { type, enumValues } = detectType(prop.type);
            if (type === "unknown") {
                warnings.push(
                    `Unknown type for ${objectName}.${propertyName}: ${JSON.stringify(prop.type)}`
                );
            }
            /** @type {PropertyEntry} */
            const entry = {
                objectName,
                propertyName,
                type,
                isFilter: type === "filter",
            };
            if (prop.displayName) entry.displayName = prop.displayName;
            if (prop.description) entry.description = prop.description;
            const def = extractDefault(prop);
            if (def !== null && def !== undefined) entry.defaultValue = def;
            else entry.defaultValue = null;
            if (enumValues) entry.enumValues = enumValues;
            properties.push(entry);
        }
    }

    return {
        visualName,
        apiVersion,
        dataRoles,
        conditions,
        supports,
        properties,
        propertyCount: properties.length,
        warnings,
        generatedAt: new Date().toISOString(),
    };
}

// CLI entry point
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
    const cwd = process.cwd();
    const capPath = join(cwd, "capabilities.json");
    const pbivizPath = join(cwd, "pbiviz.json");
    if (!existsSync(capPath)) {
        console.error(`capabilities.json not found at ${capPath}`);
        process.exit(1);
    }
    const matrix = buildMatrix(capPath, existsSync(pbivizPath) ? pbivizPath : undefined);
    const outDir = join(cwd, "e2e", "fixtures");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "capabilities-matrix.json");
    writeFileSync(outPath, JSON.stringify(matrix, null, 2) + "\n", "utf8");
    console.log(
        `Wrote ${outPath} :: visual=${matrix.visualName} propertyCount=${matrix.propertyCount}` +
            (matrix.warnings.length ? ` warnings=${matrix.warnings.length}` : "")
    );
    if (matrix.warnings.length) {
        for (const w of matrix.warnings) console.warn("  warn:", w);
    }
}
