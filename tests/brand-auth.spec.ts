import { expect, test } from "@playwright/test";

// Read-only visual acceptance on an explicitly supplied, disposable QA identity.
// Never create records, change profile preferences, or capture a human account.
const email = process.env.NUMA_BRAND_QA_EMAIL;
const password = process.env.NUMA_BRAND_QA_PASSWORD;
test.skip(!email || !password, "Provide a disposable QA identity for authenticated visual acceptance.");

for (const colorScheme of ["light", "dark"] as const) {
  test(`signed-in brand surfaces remain usable: ${colorScheme}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`${page.url()}: ${error.message}`));
    // Vite does not serve Vercel functions. Exercise the truthful unavailable-FX
    // state deterministically; this suite makes no claim about provider integration.
    await page.route("**/api/fx-rates", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"FX unavailable in visual QA"}' }));
    await page.goto("/welcome");
    await page.getByRole("button", { name: /Login with email/i }).click();
    await page.getByLabel("Email", { exact: true }).fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.locator("form button[type=submit]").click();
    await expect(page).toHaveURL(/\/$/, { timeout: 25_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem("numa:appMode"))).toBe("advanced");
    for (const [name, route] of [["home", "/"], ["money", "/money"], ["goals", "/goals"], ["settings", "/settings"], ["pod", "/pod"]]) {
      // Sign-in already navigated Home. Let its first data load finish before
      // visiting the next route; an immediate reload cancels in-flight fetches.
      if (name !== "home") await page.goto(route);
      await expect(page).toHaveURL(url => url.pathname === route);
      await expect(page.getByRole("navigation", { name: "Primary", exact: true }).filter({
        has: page.getByRole("link", { name: name === "pod" ? "Pot" : "Home", exact: true })
      })).toBeVisible();
      await expect(page.getByLabel("Loading Numa Pro")).toHaveCount(0);
      const heading = name === "home" ? /^Net worth$/ : name === "goals" ? /^Goals$/ : name === "pod" ? /Build a pod/ : undefined;
      const landmark = heading
        ? page.getByRole("heading", { level: 1, name: heading }).filter({ visible: true })
        : name === "money" ? page.getByRole("heading", { level: 1, name: "Money" })
          : page.getByRole("heading", { level: 1 }).filter({ visible: true });
      await expect(landmark).toBeVisible();
      // Framer's JS-driven entrance must finish before capturing colors/layout.
      await expect.poll(() => landmark.evaluate(el => {
        let opacity = 1;
        for (let node: Element | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        return opacity;
      })).toBe(1);
      // Local appearance event only; never use the cloud-synced Settings controls.
      await page.evaluate(scheme => {
        localStorage.setItem("numa:theme", scheme);
        dispatchEvent(new CustomEvent("numa:theme", { detail: scheme }));
      }, colorScheme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expect(page.getByRole("status").filter({ hasText: "Currency conversion unavailable." })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${colorScheme}.png`), fullPage: true });
      if (name === "home") {
        const add = page.getByRole("button", { name: "Add", exact: true })
          .or(page.getByRole("button", { name: "Capture", exact: true }))
          .or(page.getByRole("button", { name: "Add movement", exact: true }));
        await add.filter({ visible: true }).first().click();
        const entry = page.getByRole("dialog", { name: "Add transaction" });
        await expect(entry.getByLabel("Amount", { exact: true })).toBeFocused();
        await expect(entry.getByRole("button", { name: "Save expense" })).toBeDisabled();
        await expect(entry.getByRole("button", { name: "Save expense" })).toBeInViewport();
        expect(await entry.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`transaction-entry-${colorScheme}.png`) });
        await entry.getByRole("button", { name: "Close", exact: true }).click();
        await expect(entry).toHaveCount(0);
      }
    }
    if (testInfo.project.name === "chromium") {
      // /pod intentionally owns its navigation and has no app sidebar.
      await page.goto("/");
      await expect(page.locator(".nm-sidebar")).toBeVisible();
      await page.evaluate(scheme => {
        localStorage.setItem("numa:theme", scheme);
        dispatchEvent(new CustomEvent("numa:theme", { detail: scheme }));
      }, colorScheme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const sidebar = page.locator(".nm-sidebar");
      expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const lockup = sidebar.locator(".nm-brand-lockup");
      expect(await lockup.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`sidebar-enlarged-${colorScheme}.png`) });
    }
    expect(errors).toEqual([]);
  });
}
