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
import { readFileSync } from "node:fs";
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

        const certify = scripts.certify ?? "";
        const auditStep = certify.indexOf("run audit");
        const packageStep = certify.indexOf("run package");
        // Audit must be present and must run before packaging so a failed audit
        // short-circuits the `&&` chain before `pbiviz package` is ever reached.
        expect(auditStep).toBeGreaterThanOrEqual(0);
        expect(packageStep).toBeGreaterThan(auditStep);
    });
});
