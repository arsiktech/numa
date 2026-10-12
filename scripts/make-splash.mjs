#!/usr/bin/env node
/* global document */
/**
 * iOS launch-screen generator.
 *
 * Renders the Numa coin + wordmark on the Citrus canvas (light + dark) at the
 * exact point sizes / pixel ratios of current iPhones, writes the PNGs to
 * public/splash/, and rewrites the block between the `splash:begin` /
 * `splash:end` markers in index.html with matching
 * <link rel="apple-touch-startup-image"> tags. Idempotent — run it again after
 * changing the art or adding a device.
 *
 *   node scripts/make-splash.mjs
 *
 * Why screenshots instead of hand-made assets: iOS shows a launch image only
 * when one matches the device's CSS size, DPR, orientation, and color scheme
 * exactly; anything else falls back to a plain white flash. Playwright renders
 * the same HTML at every size so all frames stay pixel-identical in style.
 */

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "splash");
const indexHtmlPath = join(root, "index.html");
const fontData = readFileSync(join(root, "ios/Numa/Numa/Fonts/DMSans.ttf")).toString("base64");

/** Citrus canvas + ink (mirrors [data-theme-key="citrus"] in themes.css). */
const THEMES = {
  light: { bg: "#fbfaf3", ink: "#0f0f08" },
  dark: { bg: "#0f0f08", ink: "#f8f8ee" }
};

/**
 * Portrait iPhone classes, logical points × device pixel ratio.
 * device-width in the media query is orientation-invariant on iOS, so one
 * portrait entry covers the device. iPads are intentionally omitted — Numa is
 * phone-first and the iPad matrix would double the asset set.
 */
const DEVICES = [
  { w: 375, h: 667, r: 2 }, // SE 2/3, 8
  { w: 375, h: 812, r: 3 }, // X, XS, 11 Pro, 12/13 mini
  { w: 390, h: 844, r: 3 }, // 12, 13, 14
  { w: 393, h: 852, r: 3 }, // 14 Pro, 15, 15 Pro, 16
  { w: 402, h: 874, r: 3 }, // 16 Pro
  { w: 414, h: 896, r: 2 }, // XR, 11
  { w: 414, h: 896, r: 3 }, // XS Max, 11 Pro Max
  { w: 428, h: 926, r: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 430, h: 932, r: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 440, h: 956, r: 3 } // 16 Pro Max
];

/**
 * The launch frame is the app's first frame minus content: the bare canvas
 * plus a quiet "Numa" wordmark with the brand's one lime accent (the period).
 * No photographic coin here — its baked cream-canvas shadow can never sit
 * clean on the dark canvas, and a launch screen's job is to disappear.
 */
function pageHtml(theme) {
  const { bg, ink } = THEMES[theme];
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face { font-family: "DM Sans"; src: url(data:font/ttf;base64,${fontData}) format("truetype"); font-weight: 100 900; }
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  body {
    background: ${bg};
    display: grid;
    place-items: center;
    -webkit-font-smoothing: antialiased;
  }
  /* Slightly above geometric center — where the eye expects a mark to rest. */
  .mark {
    transform: translateY(-2.5vh);
    font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 27px;
    letter-spacing: -0.015em;
    color: ${ink};
  }
  .mark i { font-style: normal; color: #bfe438; }
</style></head><body>
  <div class="mark">Numa Pro<i>.</i></div>
</body></html>`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const links = [];
  let total = 0;

  for (const theme of Object.keys(THEMES)) {
    for (const { w, h, r } of DEVICES) {
      const context = await browser.newContext({
        viewport: { width: w, height: h },
        deviceScaleFactor: r
      });
      const page = await context.newPage();
      await page.setContent(pageHtml(theme), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const name = `apple-splash-${w * r}x${h * r}-${theme}.png`;
      await page.screenshot({ path: join(outDir, name), type: "png" });
      total += statSync(join(outDir, name)).size;
      links.push(
        `    <link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${theme})" href="/splash/${name}" />`
      );
      await context.close();
      process.stdout.write(`✓ ${name}\n`);
    }
  }
  await browser.close();

  const html = readFileSync(indexHtmlPath, "utf8");
  const begin = "<!-- splash:begin -->";
  const end = "<!-- splash:end -->";
  const beginAt = html.indexOf(begin);
  const endAt = html.indexOf(end);
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
    throw new Error("splash markers not found in index.html — refusing to write links");
  }
  const next =
    html.slice(0, beginAt + begin.length) + "\n" + links.join("\n") + "\n    " + html.slice(endAt);
  writeFileSync(indexHtmlPath, next);
  process.stdout.write(
    `\n${links.length} launch images, ${(total / 1024).toFixed(0)} KB total → public/splash/ + index.html links updated\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
