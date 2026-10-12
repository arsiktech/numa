import { expect, test } from "@playwright/test";

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.PLAYWRIGHT_BASE_URL)), "The isolated fixture runs locally.");
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:5174");
});

test("amount-first entry saves explicit income and supports keyboard cancellation", async ({ page }, testInfo) => {
  const openedAt = Date.now();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await expect(dialog).toBeVisible();
  console.log(`Transaction entry useful UI: ${Date.now() - openedAt}ms`);
  await expect(page.getByLabel("Amount", { exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save expense" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save expense" })).toHaveCSS("opacity", "0.5");
  await expect(page.getByLabel("Save to")).toHaveCount(0);
  await expect(dialog).not.toContainText("Universal capture");
  await expect(page.getByRole("button", { name: "Save expense" })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("transaction-light.png") });
  await page.getByLabel("Amount", { exact: true }).fill("12,50");
  await page.getByLabel("What was it for?").fill("Lunch");
  await page.getByRole("button", { name: "Income", exact: true }).click();
  await expect(page.getByLabel("Where did it come from?")).toHaveValue("Lunch");
  await page.getByRole("button", { name: "Save income" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  const calls = JSON.parse(await page.getByTestId("calls").innerText());
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ operation: "transaction", args: [{ kind: "income", amount: 12.5, currency: "EUR" }, { clientMutationId: expect.any(String) }] });
  await page.getByRole("button", { name: "Add transaction", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Amount", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add transaction", exact: true })).toBeFocused();
});

test("all batch entries need review; failure retries unchanged and queued is explicit", async ({ page }) => {
  await page.getByRole("button", { name: "Fail next save" }).click();
  await page.getByRole("button", { name: "Queue saves" }).click();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.getByRole("button", { name: "Add several at once" }).click();
  await page.getByLabel("Entries", { exact: true }).fill("Coffee 5.50\nMissing amount");
  await expect(page.getByRole("alert")).toContainText("Item 2");
  await expect(page.getByRole("button", { name: "Review entries" })).toBeDisabled();
  await page.getByLabel("Entries", { exact: true }).fill("Coffee 5.50, 7-Eleven 8\nGroceries 80\nDinner 20");
  await page.getByRole("button", { name: "Review entries" }).click();
  await expect(page.getByRole("list", { name: "Entries to save" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("Nothing is saved until you confirm below.")).toBeVisible();
  await page.getByRole("button", { name: "Save 4 expenses" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await page.getByRole("button", { name: "Retry save" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Waiting to sync" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "not confirmed in the cloud" })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  const calls = JSON.parse(await page.getByTestId("calls").innerText());
  expect(calls).toHaveLength(5);
  expect(calls[1]).toEqual(calls[0]);
});

test("dark enlarged shared entry explains payer and keeps the save action reachable", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await page.getByRole("button", { name: "Enable shared example" }).click();
  await page.getByRole("button", { name: "Add transaction", exact: true }).click();
  await page.addStyleTag({ content: '[role="dialog"] :is(p, label, input, select, button, h2, span, summary) { font-size: 24px !important; }' });
  await page.getByLabel("Save to").selectOption("shared");
  await expect(page.getByLabel("Paid by")).toHaveValue("alex");
  await expect(page.getByText("Split equally between Alex, Sam.")).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("12.50");
  await page.getByLabel("What was it for?").fill("Lunch together");
  await expect(page.getByRole("button", { name: "Save expense" })).toBeInViewport();
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("transaction-dark-enlarged.png") });
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Inspect local calls" }).click();
  const calls = JSON.parse(await page.getByTestId("calls").innerText());
  expect(calls[0]).toMatchObject({ operation: "pod.expense", args: [{ podId: "shared", paidByMemberId: "alex", participantMemberIds: ["alex", "sam"], currency: "USD", amount: 12.5, clientMutationId: expect.any(String) }] });
});
