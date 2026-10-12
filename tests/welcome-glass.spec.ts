import { expect, test } from "@playwright/test";

const emailButton = /Login with email|Войти по email|Entrar con email/i;

test("glass returns after drag and never gates email entry", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/welcome");
  const scene = page.locator(".nm-glass-scene");
  const sphere = page.locator(".nm-glass-sphere");
  await expect(scene).toBeVisible();
  await expect(page.getByRole("button", { name: emailButton })).toBeVisible();
  const original = await sphere.boundingBox();
  const box = await scene.boundingBox();
  if (!original || !box) throw new Error("Welcome artwork missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 - 70, { steps: 12 });
  await expect.poll(async () => (await sphere.boundingBox())!.x).toBeGreaterThan(original.x + 12);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await expect.poll(async () => Math.abs((await sphere.boundingBox())!.x - original.x)).toBeLessThan(1);

  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.getByRole("button", { name: /Switch to|Включить|Cambiar a/i }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "Numa Pro", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`welcome-${theme}.png`), fullPage: true, animations: "disabled" });
  }
  // The decorative surface is absent from keyboard order. Email stays operable.
  await page.getByRole("button", { name: emailButton }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(scene).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reduced motion disables pointer travel, including a live preference change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/welcome");
  const sphere = page.locator(".nm-glass-sphere");
  const scene = page.locator(".nm-glass-scene");
  await expect(scene).toBeVisible();
  const initial = await sphere.boundingBox();
  if (!initial) throw new Error("No glass sphere");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-reduced-motion", "true");
  await page.mouse.move(initial.x + 60, initial.y + 60);
  await page.mouse.down();
  await page.mouse.move(initial.x + 140, initial.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await sphere.boundingBox())!.x - initial.x)).toBeLessThan(1);
  await expect(page.getByRole("button", { name: emailButton })).toBeEnabled();
});

test("short viewport and enlarged text keep signup and legal links reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await page.addStyleTag({ content: ".nm-welcome-screen p, .nm-welcome-screen button, .nm-welcome-screen label, .nm-welcome-screen input { font-size: 24px !important; }" });
  await page.getByRole("button", { name: emailButton }).click();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Numa QA");
  await page.getByLabel("Email", { exact: true }).fill("layout-only@example.com");
  await page.getByLabel("Password", { exact: true }).fill("River!42Market-Layout");
  const submit = page.locator('button[type="submit"]');
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeInViewport();
  await expect(submit).toBeEnabled();
  const privacy = page.getByRole("link", { name: /Privacy/i });
  await privacy.scrollIntoViewIfNeeded();
  await expect(privacy).toBeInViewport();
  expect(await page.locator(".nm-welcome-screen").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("touch cancellation settles the glass and vertical swipes scroll", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Chromium CDP supplies real touch input; WebKit covers layout and pointer behavior above.");
  await page.setViewportSize({ width: 390, height: 480 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/welcome");
  const scene = page.locator(".nm-glass-scene");
  const sphere = page.locator(".nm-glass-sphere");
  await expect(scene).toBeVisible();
  const original = await sphere.boundingBox();
  if (!original) throw new Error("No glass sphere");
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  const x = original.x + original.width / 2;
  const y = original.y + original.height / 2;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 90, y, id: 1 }] });
  await expect.poll(async () => (await sphere.boundingBox())!.x).toBeGreaterThan(original.x + 12);
  await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(async () => Math.abs((await sphere.boundingBox())!.x - original.x)).toBeLessThan(1);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 2 }] });
  for (const distance of [20, 45, 75, 105]) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - distance, id: 2 }] });
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator(".nm-welcome-screen").evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
  await page.getByRole("button", { name: emailButton }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await client.detach();
});
