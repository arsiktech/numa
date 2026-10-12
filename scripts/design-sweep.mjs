// Design sweep — the pixel audit harness. Signs into the dev deployment with
// a disposable QA account, then screenshots a route × theme × viewport matrix
// into artifacts/design-sweep/ for frame-by-frame review.
//
//   NUMA_SWEEP_EMAIL=... NUMA_SWEEP_PASSWORD=... \
//   node scripts/design-sweep.mjs [baseUrl]
//
// Never point this at a human account; dev Convex + QA accounts only.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const EMAIL = process.env.NUMA_SWEEP_EMAIL;
const PASSWORD = process.env.NUMA_SWEEP_PASSWORD;
const OUT = "artifacts/design-sweep";

if (!EMAIL || !PASSWORD) {
  console.error("Set NUMA_SWEEP_EMAIL / NUMA_SWEEP_PASSWORD (QA account on dev Convex).");
  process.exit(1);
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 }
];
const THEMES = ["light", "dark"];
const ROUTES = [
  { name: "numa-thread", path: "/numa", settle: 1400 },
  {
    name: "numa-catalog",
    path: "/numa",
    settle: 1400,
    after: async (page) => {
      await page.getByRole("button", { name: "See all days" }).click();
      await page.waitForTimeout(1100);
    }
  },
  { name: "home", path: "/", settle: 1400 },
  { name: "wealth", path: "/wealth", settle: 1400 },
  { name: "goals", path: "/goals", settle: 1200 },
  { name: "insights", path: "/insights", settle: 1200 },
  { name: "money", path: "/money", settle: 1200 },
  { name: "settings", path: "/settings", settle: 1200 }
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORTS[1] });
const page = await context.newPage();

// ---- sign in once ----------------------------------------------------------
await page.goto(`${BASE}/welcome`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /login with email/i }).click();
await page.locator('input[name="email"]').fill(EMAIL);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole("button", { name: /^sign in$/i }).last().click();
await page.waitForURL((url) => !url.pathname.startsWith("/welcome"), { timeout: 20_000 });
console.log("signed in →", page.url());

// ---- matrix ----------------------------------------------------------------
let shot = 0;
for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  for (const theme of THEMES) {
    // Belt and suspenders: the profile may hydrate theme "auto", which follows
    // the emulated media scheme — set both so the frame is truly themed.
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => {
      window.localStorage.setItem("numa:theme", t);
    }, theme);
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(route.settle);
      if (route.after) {
        try {
          await route.after(page);
        } catch (err) {
          console.warn(`  after() failed for ${route.name}: ${String(err).slice(0, 120)}`);
        }
      }
      const file = `${OUT}/${route.name}--${theme}--${viewport.name}.png`;
      await page.screenshot({ path: file, fullPage: viewport.name === "desktop" ? false : true });
      shot += 1;
      console.log("shot", file);
    }
  }
}

await browser.close();
console.log(`done — ${shot} frames in ${OUT}/`);
