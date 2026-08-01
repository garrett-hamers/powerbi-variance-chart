import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dist = join(root, "dist");
const archive = readdirSync(dist, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".pbiviz"))
    .map(entry => join(dist, entry.name))
    .sort()
    .at(-1);

if (!archive) {
    console.error("No produced .pbiviz archive was found.");
    process.exit(1);
}

const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
if (listing.status !== 0) {
    console.error(listing.stderr || "Unable to list the produced visual archive.");
    process.exit(listing.status ?? 1);
}

const forbidden = [
    [/\bfetch\s*\(/i, "fetch"],
    [/\bXMLHttpRequest\b/i, "XMLHttpRequest"],
    [/\bWebSocket\b/i, "WebSocket"],
    [/\binnerHTML\b/i, "innerHTML"],
    [/(^|[^\w])eval\s*\(/i, "eval"],
    [/\bnew\s+Function\b/i, "new Function"],
    [/(^|[^\w])import\s*\(/i, "dynamic import"]
];

for (const entry of listing.stdout.split(/\r?\n/).filter(name => /\.js$/i.test(name) && !/\.map$/i.test(name))) {
    const content = spawnSync("tar", ["-xOf", archive, entry], { encoding: "utf8" });
    if (content.status !== 0) {
        console.error(`Unable to inspect archive entry ${entry}.`);
        process.exit(content.status ?? 1);
    }
    for (const [pattern, label] of forbidden) {
        if (pattern.test(content.stdout)) {
            console.error(`Forbidden ${label} token in packaged bundle entry ${entry}.`);
            process.exit(1);
        }
    }
}

console.log(`Archive security audit passed: ${archive}`);
