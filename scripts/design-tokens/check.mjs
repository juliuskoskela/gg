import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collect, compare } from "./lint.mjs";

let root = fileURLToPath(new URL("../../", import.meta.url));
let baseline = JSON.parse(readFileSync(new URL("./baseline.json", import.meta.url), "utf8"));
let violations = collect(root);
let { added, stale } = compare(violations, baseline.violations);
for (let violation of added) console.error(`${violation.file}:${violation.line}: ${violation.rule}: ${violation.property}: ${violation.value} (${violation.scope})`);
for (let { key, count } of stale) console.error(`Remove ${count} stale baseline allowance(s): ${key}`);
if (added.length || stale.length) {
    console.error("Use semantic tokens, or a narrowly documented design-token-allow comment. See doc/design-token-lint.md.");
    process.exitCode = 1;
} else console.log(`Design tokens checked; ${violations.length} existing declarations remain in the migration baseline.`);
