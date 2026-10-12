import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`Numa Pro public branding, enlarged text and reduced motion: ${colorScheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/welcome", "/landing", "/privacy", "/terms"]) {
      const started = Date.now();
      await page.goto(route);
      await expect(page).toHaveTitle("Numa Pro — Track money.");
      if (route === "/welcome") {
        await expect(page.getByRole("heading", { name: "Numa Pro", exact: true })).toBeVisible();
      } else if (route === "/landing") {
        await expect(page.getByRole("link", { name: "Numa Pro home" })).toBeVisible();
      } else {
        await expect(page.getByRole("link", { name: "Back to Numa Pro" })).toBeVisible();
      }
      console.log(`${route} useful UI ${Date.now() - started}ms`);
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${colorScheme}-standard.png`), fullPage: true });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      if (route === "/landing") {
        // Root overflow clipping must not disguise clipped copy or unreachable links.
        const clipped = await page.locator("h1, h2, h3, p, figcaption, dt, dd, a").evaluateAll(elements =>
          elements.filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)
        );
        expect(clipped).toEqual([]);
      }
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${colorScheme}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

function luminance(hex: string) {
  const channels = hex.trim().replace("#", "").match(/.{2}/g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test("all appearance palettes keep action and financial text readable", async ({ page }) => {
  await page.goto("/landing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const palette of ["numa", "citrus", "pebble", "coral", "carbon"]) {
    for (const appearance of ["light", "dark"]) {
      const colors = await page.evaluate(({ palette, appearance }) => {
        document.documentElement.dataset.themeKey = palette;
        document.documentElement.dataset.theme = appearance;
        const style = getComputedStyle(document.documentElement);
        return Object.fromEntries(["cta", "cta-ink", "negative", "on-negative", "positive", "paper", "bg"].map(key =>
          [key, style.getPropertyValue(`--color-${key}`).trim()]
        ));
      }, { palette, appearance });
      for (const [fg, bg] of [["cta-ink", "cta"], ["on-negative", "negative"], ["positive", "paper"], ["positive", "bg"], ["negative", "paper"]]) {
        const [a, b] = [luminance(colors[fg]), luminance(colors[bg])].sort((x, y) => y - x);
        expect((a + 0.05) / (b + 0.05), `${palette} ${appearance}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});
