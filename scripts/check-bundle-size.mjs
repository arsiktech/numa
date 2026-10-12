#!/usr/bin/env node
/**
 * Guards the initial JavaScript payload — the chunks index.html loads eagerly
 * (entry script + its modulepreloads) — against a gzip budget. This is the
 * bytes every visitor downloads before the app is interactive, so it is the
 * number that matters most for first load on mobile.
 *
 * Budget is 240 KB gzip by default (React 19/Vite 8 baseline is ~232 KB; the
 * headroom catches a regression like re-adding a heavy eager dependency
 * without being red day one). Override with NUMA_JS_BUDGET_KB.
 *
 * Run after `vite build`. Exits non-zero when over budget so CI / `npm run
 * verify` fail loudly.
 */
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST = path.resolve("dist");
const INDEX = path.join(DIST, "index.html");
const BUDGET_KB = Number(process.env.NUMA_JS_BUDGET_KB ?? 240);
const BUDGET_BYTES = BUDGET_KB * 1024;

if (!existsSync(INDEX)) {
  console.error(`check-bundle-size: ${INDEX} not found — run \`vite build\` first.`);
  process.exit(1);
}

const html = readFileSync(INDEX, "utf8");
// Eagerly-loaded JS: the entry <script type="module" src> plus every
// <link rel="modulepreload" href>. Lazy route/dialog chunks are not referenced
// here, so they correctly don't count against the initial budget.
const referenced = new Set();
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
  referenced.add(match[1]);
}

if (referenced.size === 0) {
  console.error("check-bundle-size: no /assets/*.js references found in index.html.");
  process.exit(1);
}

const rows = [...referenced]
  .map((ref) => {
    const file = path.join(DIST, ref.replace(/^\//, ""));
    const gz = existsSync(file) ? gzipSync(readFileSync(file)).length : 0;
    return { ref, gz };
  })
  .sort((a, b) => b.gz - a.gz);

const total = rows.reduce((sum, row) => sum + row.gz, 0);
const fmt = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log("Initial JS payload (gzip):");
for (const row of rows) {
  console.log(`  ${fmt(row.gz).padStart(9)}  ${row.ref}`);
}
console.log(`  ${"".padStart(9, "-")}`);
console.log(`  ${fmt(total).padStart(9)}  total  (budget ${BUDGET_KB} KB)`);

if (total > BUDGET_BYTES) {
  console.error(
    `\n✗ Initial JS payload ${fmt(total)} exceeds the ${BUDGET_KB} KB budget by ${fmt(total - BUDGET_BYTES)}.`
  );
  console.error("  Trim an eager dependency, lazy-load it, or raise NUMA_JS_BUDGET_KB intentionally.");
  process.exit(1);
}

console.log(`\n✓ Within budget (${fmt(BUDGET_BYTES - total)} headroom).`);
