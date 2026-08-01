/**
 * @vitest-environment node
 *
 * Certification gate — BLOCKER 1.
 *
 * Microsoft's certified-visual "Command requirements" state that `npm audit` must
 * not return any high or moderate advisories. Asserting only that an `audit` script
 * string exists in package.json is insufficient: a sibling visual once shipped a
 * green suite while the real gate failed for exactly that reason. This test spawns
 * the REAL npm CLI (`npm audit --audit-level=moderate --json`) and asserts that it
 * exits 0 and reports zero critical/high/moderate advisories.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

describe("certification gate", () => {
    it("real `npm audit --audit-level=moderate` exits 0 with zero moderate+ advisories", () => {
        const result = spawnSync(NPM, ["audit", "--audit-level=moderate", "--json"], {
            cwd: process.cwd(),
            encoding: "utf8",
            shell: process.platform === "win32",
            timeout: 180_000,
            maxBuffer: 32 * 1024 * 1024
        });

        expect(result.error).toBeUndefined();

        const report = JSON.parse(result.stdout || "{}");
        const vulnerabilities = report.metadata?.vulnerabilities ?? {};

        // Zero counts AND a zero exit status are both required — either alone can be
        // green while the other fails.
        expect(vulnerabilities.critical ?? -1).toBe(0);
        expect(vulnerabilities.high ?? -1).toBe(0);
        expect(vulnerabilities.moderate ?? -1).toBe(0);
        expect(result.status).toBe(0);
    }, 180_000);

    it("wires the audit fail-fast gate ahead of packaging in the certify script", () => {
        const manifest = JSON.parse(
            readFileSync(join(process.cwd(), "package.json"), "utf8")
        ) as { scripts?: Record<string, string> };
        const scripts = manifest.scripts ?? {};

        expect(scripts.audit).toBe("npm audit --audit-level=moderate");
        expect(scripts.certify).toBeTypeOf("string");
        expect(scripts["test:e2e"]).toBe(
            "npm run preview:build && playwright test --config playwright.config.ts"
        );

        const certify = scripts.certify ?? "";
        const auditStep = certify.indexOf("run audit");
        const e2eStep = certify.indexOf("run test:e2e");
        const packageStep = certify.indexOf("run package");
        // Audit must be present and must run before packaging so a failed audit
        // short-circuits the `&&` chain before `pbiviz package` is ever reached.
        expect(auditStep).toBeGreaterThanOrEqual(0);
        expect(e2eStep).toBeGreaterThan(auditStep);
        expect(packageStep).toBeGreaterThan(auditStep);
        expect(packageStep).toBeGreaterThan(e2eStep);
    });

    it("keeps the four-part version identical across every packaged manifest", () => {
        const read = (file: string) =>
            JSON.parse(readFileSync(join(process.cwd(), file), "utf8"));

        const pkg = read("package.json") as { version: string };
        const lock = read("package-lock.json") as {
            version: string;
            packages: Record<string, { version?: string }>;
        };
        const pbiviz = read("pbiviz.json") as {
            visual: { version: string; guid: string };
            version: string;
            apiVersion: string;
        };

        const fourPart = /^\d+\.\d+\.\d+\.\d+$/;
        expect(pkg.version).toMatch(fourPart);

        // A mismatch here ships a package whose reported version disagrees with the
        // source, which breaks the certification requirement that the compiled package
        // exactly matches the submitted one.
        expect(pbiviz.visual.version).toBe(pkg.version);
        expect(pbiviz.version).toBe(pkg.version);
        expect(lock.version).toBe(pkg.version);
        expect(lock.packages[""]?.version).toBe(pkg.version);

        // The About card is what a report author actually sees in the format pane.
        const settingsSource = readFileSync(join(process.cwd(), "src/settings.ts"), "utf8");
        expect(settingsSource).toContain(`value: "${pkg.version}"`);

        const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
        expect(readme).toContain(`Version-${pkg.version}-blue`);
    });

    it("keeps the visual GUID and pinned API version stable", () => {
        const pbiviz = JSON.parse(
            readFileSync(join(process.cwd(), "pbiviz.json"), "utf8")
        ) as { visual: { guid: string }; apiVersion: string; externalJS: unknown; stringResources: unknown[] };
        const pkg = JSON.parse(
            readFileSync(join(process.cwd(), "package.json"), "utf8")
        ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

        // Regenerating the GUID orphans every existing report that uses the visual.
        expect(pbiviz.visual.guid).toBe("varianceChart8E466B43903E4620A971846965AD2671");

        // apiVersion must track the installed powerbi-visuals-api exactly.
        expect(pbiviz.apiVersion).toBe(pkg.dependencies["powerbi-visuals-api"]);
        expect(pkg.dependencies["powerbi-visuals-api"]).toMatch(/^\d+\.\d+\.\d+$/);
        expect(pkg.devDependencies["powerbi-visuals-tools"]).toMatch(/^\d+\.\d+\.\d+$/);

        // Certification requires no external script loading.
        expect(pbiviz.externalJS).toBeNull();
    });

    it("declares no privileges, so no WebAccess can slip in", () => {
        const capabilities = JSON.parse(
            readFileSync(join(process.cwd(), "capabilities.json"), "utf8")
        ) as { privileges: unknown[] };
        expect(Array.isArray(capabilities.privileges)).toBe(true);
        expect(capabilities.privileges).toHaveLength(0);
    });

    it("keeps advertised host surfaces and localized resources wired", () => {
        const capabilities = JSON.parse(
            readFileSync(join(process.cwd(), "capabilities.json"), "utf8")
        ) as {
            supportsHighlight: boolean;
            supportsOnObjectFormatting: boolean;
            enablePointerEventsFormatMode: boolean;
            sorting?: { default?: Record<string, never> };
            tooltips?: { supportEnhancedTooltips?: boolean };
        };
        const pbiviz = JSON.parse(
            readFileSync(join(process.cwd(), "pbiviz.json"), "utf8")
        ) as { stringResources?: string[] };

        expect(capabilities.supportsHighlight).toBe(true);
        expect(capabilities.supportsOnObjectFormatting).toBe(true);
        expect(capabilities.enablePointerEventsFormatMode).toBe(true);
        expect(capabilities.sorting?.default).toEqual({});
        expect(capabilities.tooltips?.supportEnhancedTooltips).toBe(true);

        expect(pbiviz.stringResources).toEqual([
            "stringResources/en-US/resources.resjson",
            "stringResources/de-DE/resources.resjson",
            "stringResources/fr-FR/resources.resjson",
            "stringResources/ja-JP/resources.resjson"
        ]);
        for (const resource of pbiviz.stringResources) {
            expect(existsSync(join(process.cwd(), resource))).toBe(true);
        }
    });
});
