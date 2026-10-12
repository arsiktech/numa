import { expect, test, type Page } from "@playwright/test";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.PLAYWRIGHT_BASE_URL)), "The isolated experience fixture only runs locally.");
test.beforeEach(async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const startedAt = Date.now();
  await page.goto("http://127.0.0.1:5174");
  await expect(page.getByRole("button", { name: "Add Simple transaction", exact: true })).toBeVisible();
  await testInfo.attach("cold-preview-ready-timing", { body: JSON.stringify({ elapsedMs: Date.now() - startedAt, scope: "fresh browser context navigation to visible Simple opener; local fixture only" }), contentType: "application/json" });
});
async function enterExpense(page: Page) {
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Add Simple transaction", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add expense", exact: true })).toBeVisible();
  const dialogOpenMs = Date.now() - startedAt;
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByLabel("Note", { exact: true }).fill("Fictional lunch");
  return dialogOpenMs;
}
async function inspectCalls(page: Page) {
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  return JSON.parse(await page.getByTestId("calls").innerText());
}

test("Simple capture retries the exact transaction and receipt", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Fail next save" }).click();
  const dialogOpenMs = await enterExpense(page);
  await testInfo.attach("simple-dialog-open-timing", { body: JSON.stringify({ elapsedMs: dialogOpenMs, scope: "opener click to visible real Simple dialog; local fixture only" }), contentType: "application/json" });
  await page.getByRole("button", { name: /^Add .* to Food$/ }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Note")).toBeDisabled();
  await expect(page.getByLabel("Expense date")).toBeDisabled();
  const retry = page.getByRole("button", { name: "Retry save" });
  await expect(retry).toBeInViewport();
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const calls = await inspectCalls(page);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0].args[0]).toMatchObject({ amount: 12, description: "Fictional lunch", portfolioId: "fictional", createdByUserId: "fictional-person" });
  expect(calls[0].args[1].clientMutationId).toBeTruthy();
});

test("pending save cannot dismiss, queued save remains visible until Done", async ({ page }) => {
  await page.getByRole("button", { name: "Queue saves" }).click();
  await page.getByRole("button", { name: "Hold next save" }).click();
  await enterExpense(page);
  await page.getByRole("button", { name: /^Add .* to Food$/ }).click();
  await expect(page.getByRole("button", { name: "Adding..." })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close add expense" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(2, 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  // Explicit fixture seam resolves the held promise without a provider call.
  await page.getByTestId("finish-pending").evaluate((button: HTMLButtonElement) => button.click());
  const dialog = page.getByRole("dialog", { name: "Waiting to sync" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("not confirmed in the cloud");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await inspectCalls(page)).toHaveLength(1);
});

for (const theme of ["light", "dark"]) {
  test(`Simple ${theme} enlarged text keeps controls reachable and keyboard focus contained`, async ({ page }, testInfo) => {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark" }).click();
    // Mobile WebKit does not focus a button on touch. Establish a keyboard
    // trigger so this check can verify restoration to the actual prior focus.
    const opener = page.getByRole("button", { name: "Add Simple transaction", exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    await page.addStyleTag({ content: '[role="dialog"] :is(p, input, button, h2, span) { font-size: 24px !important; }' });
    await page.getByRole("button", { name: "1", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const save = page.getByRole("button", { name: /^Add .* to Food$/ });
    await expect(save).toBeInViewport();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await dialog.locator("fieldset").evaluate(el => {
      const scroller = el.parentElement!;
      return scroller.scrollWidth <= scroller.clientWidth;
    })).toBe(true);
    await save.focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`simple-${theme}-enlarged.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Simple transaction", exact: true })).toBeFocused();
  });
}
