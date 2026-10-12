import { expect, test } from "@playwright/test";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.PLAYWRIGHT_BASE_URL)), "The isolated experience fixture only runs locally.");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:5174");
});

test("fractional investment capture keeps retry identity and reachable actions", async ({ page }) => {
  await page.getByRole("button", { name: "Fail next save" }).click();
  await page.getByRole("button", { name: "Add an investment" }).click();
  await page.getByLabel("Find your investment").fill("Bitcoin");
  await page.getByRole("button", { name: /Bitcoin.*BTC/ }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("0.00000001");
  await page.getByLabel("Total paid", { exact: true }).fill("0,01");
  const save = page.getByRole("button", { name: "Add holding" });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Quantity", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry save" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  const calls = JSON.parse(await page.getByTestId("calls").innerText());
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0].args[0]).toMatchObject({ quantity: 0.00000001, costBasis: 0.01 });
});

test("dark enlarged form exposes precise errors without horizontal overflow", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
  await page.getByRole("button", { name: "Add an investment" }).click();
  await page.addStyleTag({ content: '[role="dialog"] :is(p, label, input, select, button, h2, span) { font-size: 24px !important; }' });
  await page.getByRole("button", { name: "Enter details myself" }).click();
  await page.getByRole("button", { name: "Add holding" }).click();
  await expect(page.getByRole("alert")).toContainText("Check the highlighted");
  await expect(page.getByLabel("Symbol", { exact: true })).toBeFocused();
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Add holding" })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("holding-dark-enlarged.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("snapshot feedback distinguishes saving, failure, retry and queued", async ({ page }) => {
  await page.getByRole("button", { name: "Fail next save" }).click();
  await page.getByRole("button", { name: "Snapshot now" }).click();
  await expect(page.getByRole("button", { name: "Saving snapshot…" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await page.getByRole("button", { name: "Queue saves" }).click();
  await page.getByRole("button", { name: "Try snapshot again" }).click();
  await expect(page.getByRole("status")).toContainText("Snapshot queued");
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  const calls = JSON.parse(await page.getByTestId("calls").innerText());
  expect(calls[1]).toEqual(calls[0]);
});
