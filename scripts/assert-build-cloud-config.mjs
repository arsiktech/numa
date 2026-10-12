#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const INDEX = path.join(DIST, "index.html");

if (!existsSync(INDEX)) {
  console.error("assert-build-cloud-config: dist/index.html is missing; run the Vite build first.");
  process.exit(1);
}

const html = readFileSync(INDEX, "utf8");
const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((match) => match[1]);

if (assetPaths.length === 0) {
  console.error("assert-build-cloud-config: no JavaScript bundles found in dist/index.html.");
  process.exit(1);
}

const bundles = assetPaths
  .map((assetPath) => path.join(DIST, assetPath.replace(/^\//, "")))
  .filter((filePath) => existsSync(filePath))
  .map((filePath) => readFileSync(filePath, "utf8"))
  .join("\n");

if (!/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.cloud/i.test(bundles)) {
  console.error("assert-build-cloud-config: built bundle is missing a Convex cloud URL.");
  process.exit(1);
}

if (/https?:\/\/127\.0\.0\.1:321[01]/i.test(bundles)) {
  console.error("assert-build-cloud-config: built bundle contains a local Convex URL.");
  process.exit(1);
}

console.log("ok - built bundle contains a Convex cloud URL");
