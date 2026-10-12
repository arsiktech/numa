import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateAuditReport } from "./audit-report.mjs";

const allowedAdvisories = new Map([
  [
    "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
    "React Router unstable RSC APIs only; Numa is a Vite SPA and the guard below rejects RSC imports."
  ]
]);

const forbiddenRuntimePackages = [
  "@react-router/dev",
  "@react-router/node",
  "@react-router/serve",
  "@react-router/fs-routes"
];
const forbiddenSourcePattern =
  /react-router(?:-dom)?\/(?:rsc|server)|\b(?:RSCHydratedRouter|RSCStaticRouter|createCallServer|routeRSC|unstable_[A-Za-z0-9_]*RSC[A-Za-z0-9_]*)\b/;

function fail(message) {
  console.error(`Release dependency audit failed: ${message}`);
  process.exit(1);
}

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const installed = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
  ...packageJson.optionalDependencies
};
for (const packageName of forbiddenRuntimePackages) {
  if (installed[packageName]) {
    fail(`${packageName} enables a React Router server runtime, so the RSC advisory exception is no longer valid.`);
  }
}

for (const root of ["src", "api", "tests"]) {
  for (const path of sourceFiles(root)) {
    if (forbiddenSourcePattern.test(readFileSync(path, "utf8"))) {
      fail(`${path} references React Router server/RSC APIs, so the advisory exception is no longer valid.`);
    }
  }
}

let auditJson;
try {
  auditJson = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch (error) {
  auditJson = String(error.stdout ?? "");
  if (!auditJson.trim()) {
    fail(`npm audit did not return JSON: ${String(error.stderr ?? error.message).trim()}`);
  }
}

let report;
try {
  report = JSON.parse(auditJson);
} catch {
  fail("npm audit returned invalid JSON.");
}

let vulnerabilities;
try {
  vulnerabilities = validateAuditReport(report);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const acceptedPackages = new Set();
const acceptedReasons = new Set();

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const via = vulnerability.via ?? [];
  const advisories = via.filter((item) => typeof item === "object" && item !== null);
  if (
    advisories.length > 0 &&
    advisories.length === via.length &&
    advisories.every((item) => allowedAdvisories.has(item.url))
  ) {
    acceptedPackages.add(name);
    for (const item of advisories) {
      acceptedReasons.add(`${item.url} — ${allowedAdvisories.get(item.url)}`);
    }
  }
}

let changed = true;
while (changed) {
  changed = false;
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (acceptedPackages.has(name)) continue;
    const via = vulnerability.via ?? [];
    if (via.length > 0 && via.every((item) => typeof item === "string" && acceptedPackages.has(item))) {
      acceptedPackages.add(name);
      changed = true;
    }
  }
}

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const blocking = Object.entries(vulnerabilities).filter(
  ([name, vulnerability]) =>
    !acceptedPackages.has(name) &&
    (severityRank[vulnerability.severity] ?? 4) >= severityRank.moderate
);

if (blocking.length > 0) {
  for (const [name, vulnerability] of blocking) {
    console.error(`- ${name}: ${vulnerability.severity}`);
  }
  fail(`${blocking.length} unexpected production vulnerability record(s).`);
}

console.log("Production dependency audit passed.");
for (const reason of acceptedReasons) {
  console.log(`Accepted application-unreachable advisory: ${reason}`);
}
