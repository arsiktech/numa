import { expect, test } from "@playwright/test";

// Real DEV accounts only, enabled by the same opt-in as the main journey suite.
const createQaAccount = process.env.NUMA_E2E_CREATE_QA_ACCOUNT === "1";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

for (const mode of ["Simple", "Advanced", "Shared pot"] as const) {
  test(`two-step onboarding opens ${mode} and preserves the choice`, async ({ page, baseURL }, testInfo) => {
    test.skip(!createQaAccount, "Requires disposable DEV QA signup.");
    test.skip(!baseURL?.includes("127.0.0.1") && !baseURL?.includes("localhost"), "Local DEV candidate only.");
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Login with email" }).click();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Numa QA");
    await page.getByLabel("Email", { exact: true }).fill(`numa-e2e+setup-${runId}-${testInfo.project.name}-${mode.replaceAll(" ", "")}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill(`River!42Market-${runId}`);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/onboarding\/mode$/, { timeout: 30_000 });
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
    await expect(page.getByText("Pick your vibe.")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("01-mode.png") });

    // Enlarge text in a short mobile viewport: every choice must stay reachable.
    await page.setViewportSize({ width: 390, height: 568 });
    await page.addStyleTag({ content: 'p, button { font-size: 24px !important; }' });
    const choice = page.getByRole("button", { name: new RegExp(`^${mode}`) });
    await choice.scrollIntoViewIfNeeded();
    await expect(choice).toBeInViewport();
    await choice.click();
    await expect(page).toHaveURL(/\/onboarding\/setup$/);
    await expect(page.getByText("Step 2 of 2")).toBeVisible();
    if (mode === "Shared pot") await page.getByRole("textbox", { name: "Pot name" }).fill("QA Home");
    await page.screenshot({ path: testInfo.outputPath("02-setup.png"), fullPage: true });
    await page.getByRole("button", { name: /^Continue with/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(page.locator("main")).toBeVisible();
    const expectedMode = mode === "Simple" ? "light" : mode === "Advanced" ? "advanced" : "shared";
    await expect(page.locator("html")).toHaveAttribute("data-mode", expectedMode);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", expectedMode);
    await expect(page).not.toHaveURL(/onboarding/);
    if (mode === "Advanced") {
      await expect(page.getByRole("heading", { name: "Monthly income pace" })).toHaveCount(0);
      await expect(page.getByText(/starter target|MRR target/)).toHaveCount(0);
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(page.getByRole("region", { name: "Net worth", exact: true }).locator("svg")).toHaveCount(0);
      await page.goto("/goals");
      await page.getByRole("button", { name: "New goal", exact: true }).first().click();
      const goalDialog = page.getByRole("dialog", { name: "New goal" });
      await goalDialog.getByRole("button", { name: "Monthly", exact: true }).click();
      await goalDialog.getByLabel("Target (EUR)", { exact: true }).fill("1500");
      await goalDialog.getByRole("button", { name: "Set goal", exact: true }).click();
      await expect(goalDialog).toBeHidden();
      // The income pace panel moved from Home to Goals with the Balance home.
      await page.goto("/goals");
      await expect(page.getByRole("heading", { name: "Monthly income pace" })).toBeVisible();
      await expect(page.getByText("Your income goal", { exact: true }).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: "Edit target", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Edit goal" }).getByLabel("Target (EUR)")).toHaveValue("1500");
      await page.keyboard.press("Escape");
    }
    await page.screenshot({ path: testInfo.outputPath("03-home.png") });
  });
}
