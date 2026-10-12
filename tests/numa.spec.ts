import { expect, test, type Locator, type Page } from "@playwright/test";

const E2E_EMAIL = process.env.NUMA_E2E_EMAIL;
const E2E_PASSWORD = process.env.NUMA_E2E_PASSWORD;
const E2E_CREATE_QA_ACCOUNT = process.env.NUMA_E2E_CREATE_QA_ACCOUNT === "1";
const E2E_RUN_ID = process.env.NUMA_E2E_RUN_ID ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const E2E_PASSWORD_VALUE = E2E_PASSWORD ?? `River!42Market-${E2E_RUN_ID}`;
const E2E_READY = Boolean((E2E_EMAIL && E2E_PASSWORD) || E2E_CREATE_QA_ACCOUNT);
const WELCOME_HEADLINE_RE = /Track money\.|Следите за деньгами\.|Gestiona tu dinero\./i;
const LOGIN_EMAIL_RE = /Login with email|Войти по email|Entrar con email/i;
const SIGN_IN_RE = /Sign in|Войти|Entrar/i;
const CREATE_ACCOUNT_RE = /Create account|Создать аккаунт|Crear cuenta/i;
const NAME_LABEL_RE = /Name|Имя|Nombre/i;
const EMAIL_LABEL_RE = /^Email$/i;
const PASSWORD_LABEL_RE = /Password|Пароль|Contraseña/i;
const CLOSE_RE = /Close|Закрыть|Cerrar/i;
const AUTH_ERROR_RE = /invalid|failed|already|exist|wrong|incorrect|ошиб|невер|существ|fall|incorrect|existe/i;
const createdQaAccounts = new Set<string>();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.describe("Numa public smoke", () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test("welcome, legal, and legacy auth routes render without layout regressions", async ({
    page
  }) => {
    const errors = collectPageErrors(page);
    const routes = [
      { route: "/welcome", expectedPath: "/welcome", text: WELCOME_HEADLINE_RE },
      { route: "/terms", expectedPath: "/terms", text: "Terms of use" },
      { route: "/privacy", expectedPath: "/privacy", text: "Privacy overview" },
      { route: "/login", expectedPath: "/welcome", text: LOGIN_EMAIL_RE },
      { route: "/signup", expectedPath: "/welcome", text: LOGIN_EMAIL_RE }
    ];

    for (const item of routes) {
      await gotoAndSettle(page, item.route);
      await expect(page).toHaveURL(new RegExp(`${item.expectedPath}$`));
      await expect(page.getByText(item.text).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
      await expect(page.locator("body")).not.toContainText("404 Not Found");
      await expectNoHorizontalOverflow(page);
    }

    await gotoAndSettle(page, "/welcome");
    await expect(page.getByRole("button", { name: /^(Coin|3D|Orb)$/ })).toHaveCount(0);

    await gotoAndSettle(page, "/terms");
    await expect(page.locator("body")).toContainText("seven-day grace period");
    await expect(page.locator("body")).not.toContainText("Numa beta");

    await gotoAndSettle(page, "/privacy");
    await expect(page.locator("body")).toContainText("seven-day deletion grace period");

    expect(errors()).toEqual([]);
  });

  test("protected app routes redirect cleanly to welcome when signed out", async ({
    page
  }) => {
    const errors = collectPageErrors(page);
    const routes = ["/", "/money", "/buckets", "/wealth", "/shared", "/pod", "/settings"];

    for (const route of routes) {
      await gotoAndSettle(page, route);
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.getByRole("button", { name: LOGIN_EMAIL_RE })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
      await expectNoHorizontalOverflow(page);
    }

    expect(errors()).toEqual([]);
  });

  test("landing explains the product and its links work in both themes", async ({ page }) => {
    const errors = collectPageErrors(page);
    for (const theme of ["light", "dark"] as const) {
      await gotoAndSettle(page, "/landing");
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Track money.");
      await expect(page.getByText("Example portfolio")).toBeVisible();
      await expect(page.getByRole("button", { name: /Settle all/ })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await page.getByRole("link", { name: "Meet Numa Pro" }).click();
      await expect(page.getByRole("heading", { name: "More perspective. Less mental arithmetic." })).toBeInViewport();
      await page.getByRole("link", { name: "Privacy", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Privacy overview" })).toBeVisible();
      await gotoAndSettle(page, "/landing");
      await page.getByRole("link", { name: "Get started", exact: true }).first().click();
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.getByRole("button", { name: LOGIN_EMAIL_RE })).toBeVisible();
    }
    expect(errors()).toEqual([]);
  });

  test("email sign-up surface fits the first viewport", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoAndSettle(page, "/welcome");
    await page.getByRole("button", { name: LOGIN_EMAIL_RE }).click();
    await page.getByRole("button", { name: CREATE_ACCOUNT_RE }).click();

    await expect(page.getByLabel(NAME_LABEL_RE)).toBeVisible();
    await expect(page.getByLabel(EMAIL_LABEL_RE)).toBeVisible();
    await expect(page.getByLabel(PASSWORD_LABEL_RE)).toBeVisible();
    await expect(page.getByRole("button", { name: CREATE_ACCOUNT_RE }).last()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMainControlsInViewport(page);

    expect(errors()).toEqual([]);
  });

  test("welcome auth surface follows the stored Russian locale", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoAndSettle(page, "/welcome");
    await page.evaluate(() => window.localStorage.setItem("numa:locale", "ru"));
    await page.reload();

    await expect(page.getByText("Следите за деньгами.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти по email" })).toBeVisible();
    await page.getByRole("button", { name: "Войти по email" }).click();
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page.getByLabel("Имя")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(errors()).toEqual([]);
  });

  test("email sign-up blocks weak passwords before submit", async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoAndSettle(page, "/welcome");
    await page.getByRole("button", { name: LOGIN_EMAIL_RE }).click();
    await page.getByRole("button", { name: CREATE_ACCOUNT_RE }).click();

    await page.getByLabel(NAME_LABEL_RE).fill("Numa QA");
    await page.getByLabel(EMAIL_LABEL_RE).fill("numa-qa@example.com");
    await page.getByLabel(PASSWORD_LABEL_RE).fill("password123");

    await expect(page.getByText(/Avoid common|частые|comunes/i)).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: CREATE_ACCOUNT_RE }).last()).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    expect(errors()).toEqual([]);
  });
});

test.describe("Numa cloud-first smoke", () => {
  test.skip(
    !E2E_READY,
    "Set NUMA_E2E_EMAIL/NUMA_E2E_PASSWORD, or explicitly set NUMA_E2E_CREATE_QA_ACCOUNT=1 for disposable QA signup."
  );

  // Fresh disposable-account signup, profile provisioning, and the first
  // cloud subscriptions share this budget. Keep enough headroom for a slow
  // DEV round trip so a healthy rendered screen is not misreported as a
  // product timeout.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    await signInWithEmail(page, testInfo);
  });

  test("email sign-in reaches the authenticated app", async ({ page }) => {
    await expect(page).not.toHaveURL(/\/welcome/);
    await expect(page).not.toHaveURL(/\/onboarding\//);
    await expect(page.locator("main")).toBeVisible();
    // The reused QA account may be left in any mode; shared mode has its own nav.
    await expect(page.getByRole("navigation", { name: /^(Primary|Shared pot|Shared pod actions)$/ }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
  });

  test("desktop mode navigation exposes the right product surface", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectPageErrors(page);

    await chooseAppMode(page, "advanced");
    // Wealth merged into the home (2026-10-11); Money takes its nav slot.
    await expectVisiblePrimaryNav(page, ["/", "/money", "/goals", "/insights"], ["/wealth"]);
    for (const route of ["/", "/money", "/goals", "/insights", "/shared", "/pod", "/settings"]) {
      await expectRouteHealthy(page, route);
    }

    await chooseAppMode(page, "light");
    await expectVisiblePrimaryNav(page, ["/", "/buckets", "/money"], ["/wealth", "/shared"]);
    await expectRouteHealthy(page, "/");
    // Home is the Balance view (2026-10-11): net worth first, one add action.
    await expect(page.getByRole("heading", { level: 1, name: "Net worth" })).toBeVisible();
    await page.getByRole("button", { name: "Add transaction", exact: true }).click();
    const desktopAdd = page.getByRole("dialog", { name: "Add expense" });
    await expect(desktopAdd).toBeVisible();
    // Quick-add opens EMPTY by design — prefilled demo amounts risked saving
    // junk records on an accidental confirm.
    await expect(desktopAdd.getByRole("button", { name: /^Add .*0\.00 to/ })).toBeDisabled();
    for (const key of ["6", ".", "4", "0"]) {
      await desktopAdd.getByRole("button", { name: key, exact: true }).click();
    }
    await expect(desktopAdd.getByRole("button", { name: /^Add .*6\.40 to/ })).toBeEnabled();
    await expectDialogInViewport(page, desktopAdd);
    await desktopAdd.getByLabel("Close add expense").click();
    await expect(desktopAdd).toBeHidden();
    await expectRouteHealthy(page, "/buckets");
    const bucketName = `E2E Trips ${Date.now()}`;
    await page.getByLabel("New bucket").click();
    const newGoalDialog = page.getByRole("dialog", { name: "New goal" });
    await expect(newGoalDialog).toBeVisible();
    await newGoalDialog.getByLabel("Goal name (optional)").fill(bucketName);
    await newGoalDialog.getByLabel(/^Target/).fill("4000");
    await newGoalDialog.getByRole("button", { name: "Set goal" }).click();
    await expect(newGoalDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(bucketName).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: new RegExp(bucketName) }).first().click();
    await expect(page.getByRole("heading", { name: new RegExp(bucketName) })).toBeVisible();
    // The reused QA account may already have income in it, so any percentage is fine.
    await expect(page.getByText(/^(\d{1,3}%|Unavailable)$/).first()).toBeVisible();
    await expect(page.getByText("NaN")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add money" })).toBeVisible();
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit goal" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Edit goal" })).toBeHidden();
    await page.getByRole("button", { name: "Back to buckets" }).click();
    await expect(page.getByRole("heading", { name: "Buckets" })).toBeVisible();
    await expectRouteHealthy(page, "/money");
    await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();
    await expect(page.getByLabel("Search transactions")).toBeVisible();
    await expectRouteHealthy(page, "/settings");
    await expect(page.getByText("current mode")).toBeVisible();
    await page.getByRole("button", { name: /Switch/ }).click();
    const modeSheet = page.getByRole("dialog", { name: "Switch mode" });
    await expect(modeSheet).toBeVisible();
    await expect(modeSheet.getByText("Your data stays put")).toBeVisible();
    await expect(modeSheet.getByRole("button", { name: /Simple/ })).toBeVisible();
    await expect(modeSheet.getByRole("button", { name: /Advanced/ })).toBeVisible();
    await expect(modeSheet.getByRole("button", { name: /Shared Pot/ })).toBeVisible();
    await expectDialogInViewport(page, modeSheet);
    await modeSheet.getByRole("button", { name: "Done" }).click();
    await page.goto("/wealth");
    await expect(page).toHaveURL(/\/$/);
    await expectNoHorizontalOverflow(page);
    // /shared is a legacy alias that now redirects to the always-on /pod
    // (it used to be advanced-gated and bounce a light user to /).
    await page.goto("/shared");
    await expect(page).toHaveURL(/\/pod$/);
    await expectNoHorizontalOverflow(page);

    await chooseAppMode(page, "shared");
    await expect(page.getByRole("link", { name: "Pot" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expectRouteHealthy(page, "/");
    await expect(page.locator("body")).toContainText(/Shared pot|Общий пот|Bote compartido|All settled|Create the pot|Add expense/);
    await page.goto("/money");
    await expect(page).toHaveURL(/\/$/);
    await expectNoHorizontalOverflow(page);
    await page.goto("/buckets");
    await expect(page).toHaveURL(/\/$/);
    await expectNoHorizontalOverflow(page);
    await expectRouteHealthy(page, "/settings");

    expect(errors()).toEqual([]);
  });

  test("mobile shared mode keeps the pod primary and reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);

    await chooseAppMode(page, "shared");
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("body")).toContainText(/Shared pot|Общий пот|Bote compartido|All settled|Create the pot|Add expense/);
    await ensurePodExists(page);
    await page.evaluate(() => window.localStorage.setItem("numa:locale", "ru"));
    await page.reload();
    await expect(page.locator("body")).toContainText(/Общий пот|Баланс пота/);
    await expectInViewport(
      page,
      page.locator('[data-pod-dashboard-slot="balance"]').getByRole("button", {
        name: /Добавить расход/
      })
    );
    await page
      .locator('[data-pod-dashboard-slot="balance"]')
      .getByRole("button", { name: /Добавить расход/ })
      .click();
    const expenseDialog = page.getByRole("dialog", { name: /Добавить общий расход/ });
    await expect(expenseDialog).toBeVisible();
    await expect(expenseDialog.getByText("Умный ввод")).toBeVisible();
    await expect(expenseDialog.getByText("Сумма")).toBeVisible();
    await expect(expenseDialog.getByText("Категория")).toBeVisible();
    await expenseDialog.getByRole("button", { name: CLOSE_RE }).click();

    await page.getByRole("button", { name: /Вся история/ }).click();
    const historyDialog = page.getByRole("dialog", { name: /Вся история/ });
    await expect(historyDialog).toBeVisible();
    await historyDialog.getByRole("button", { name: CLOSE_RE }).click();

    await page.getByRole("button", { name: /Настройки/ }).last().click();
    await expect(page).toHaveURL(/\/settings$/);
    await expectNoHorizontalOverflow(page);

    await expectVisiblePrimaryNav(page, ["/", "/settings"], ["/money", "/wealth", "/shared"]);

    await gotoAndSettle(page, "/money");
    await expect(page).toHaveURL(/\/$/);
    await expectNoHorizontalOverflow(page);

    expect(errors()).toEqual([]);
  });

  test("shared desktop pot keeps the one-screen workflow reachable", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Asserts the desktop shared rail; mobile pod coverage lives in the dedicated mobile shared specs."
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectPageErrors(page);

    await chooseAppMode(page, "shared");
    await gotoAndSettle(page, "/pod");
    await ensurePodExists(page);
    await expect(page.getByRole("link", { name: "Pot" })).toBeVisible();
    const sharedRail = page.getByRole("navigation", { name: "Shared pot" });
    await expect(sharedRail.getByRole("button", { name: "Activity" })).toBeVisible();
    await expect(sharedRail.getByRole("button", { name: "Settle" })).toBeVisible();
    await expect(sharedRail.getByRole("button", { name: "People" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add split" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(page.getByText("fewest transfers to settle")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await sharedRail.getByRole("button", { name: "Activity" }).click();
    const historyDialog = page.getByRole("dialog", { name: /All history|History/ });
    await expect(historyDialog).toBeVisible();
    await expectDialogInViewport(page, historyDialog);
    await historyDialog.getByRole("button", { name: CLOSE_RE }).click();

    await sharedRail.getByRole("button", { name: "Settle" }).click();
    const settleDialog = page.getByRole("dialog", { name: /Settle up/ });
    await expect(settleDialog).toBeVisible();
    await expectDialogInViewport(page, settleDialog);
    await settleDialog.getByRole("button", { name: CLOSE_RE }).click();

    await sharedRail.getByRole("button", { name: "People" }).click();
    const peopleDialog = page.getByRole("dialog", { name: /People & cards|Pot settings/ });
    await expect(peopleDialog).toBeVisible();
    await expectDialogInViewport(page, peopleDialog);
    await peopleDialog.getByRole("button", { name: CLOSE_RE }).click();

    expect(errors()).toEqual([]);
  });

  test("universal capture opens cleanly on desktop and mobile", async ({ page }) => {
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Search" }).click();
    const shortcutSearch = page.getByRole("dialog", { name: "Search" });
    await expect(shortcutSearch).toBeVisible();
    await expect(shortcutSearch).toHaveCount(1);
    await expectDialogInViewport(page, shortcutSearch);
    await expectLocatorOnTop(page, shortcutSearch);
    await page.keyboard.press("Escape");
    await expect(shortcutSearch).toBeHidden();
    await openCaptureControl(page);
    const desktopCapture = page.getByRole("dialog", { name: "Add transaction" });
    await expect(desktopCapture).toBeVisible();
    await expectDialogInViewport(page, desktopCapture);
    await expect(desktopCapture.getByRole("button", { name: "Save expense" })).toBeDisabled();
    await desktopCapture.getByLabel("Amount", { exact: true }).fill("4.56");
    await desktopCapture.getByLabel("What was it for?").fill("qa coffee");
    await expect(desktopCapture.getByRole("button", { name: "Save expense" })).toBeEnabled();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await desktopCapture.getByRole("button", { name: "Close" }).click();
    await expect(desktopCapture).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await openCaptureControl(page);
    const mobileCapture = page.getByRole("dialog", { name: "Add transaction" });
    await expect(mobileCapture).toBeVisible();
    await expectDialogInViewport(page, mobileCapture);
    await expectNoHorizontalOverflow(page);
    await mobileCapture.getByRole("button", { name: "Close" }).click();

    await chooseAppMode(page, "light");
    await page.goto("/");
    await page.getByRole("button", { name: "Add something" }).first().click();
    const lightAdd = page.getByRole("dialog", { name: "Add expense" });
    await expect(lightAdd).toBeVisible();
    await expectDialogInViewport(page, lightAdd);
    await expect(lightAdd.getByRole("button", { name: "6", exact: true })).toBeVisible();
    await expect(lightAdd.getByRole("button", { name: /^Add .* to / })).toBeDisabled();
    await lightAdd.getByRole("button", { name: "Close add expense" }).click();
    await expect(lightAdd).toBeHidden();

    expect(errors()).toEqual([]);
  });

  test("AI attach photo opens the scan capture flow", async ({ page }) => {
    test.skip(
      process.env.VITE_NUMA_AI_ENABLED !== "1",
      "Numa AI surfaces are gated off unless VITE_NUMA_AI_ENABLED=1"
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    await page.goto("/");
    await page.getByRole("button", { name: /Ask Numa|Спросить Numa|Preguntar Numa/ }).click();
    const aiDialog = page.locator('[role="dialog"]').filter({ hasText: "Try one of these:" }).first();
    await expect(page.locator('[role="dialog"]').filter({ hasText: "Try one of these:" })).toHaveCount(1);
    await expect(aiDialog).toBeVisible();
    await expectDialogInViewport(page, aiDialog);
    await expectLocatorOnTop(page, aiDialog);
    await aiDialog.getByRole("button", { name: "Attach photo" }).click();

    const scanDialog = page.getByRole("dialog", { name: "Scan a receipt or statement" });
    await expect(scanDialog).toBeVisible();
    await expectDialogInViewport(page, scanDialog);
    await expectLocatorOnTop(page, scanDialog);
    await scanDialog.getByRole("button", { name: "Close" }).click();
    await page.getByRole("dialog", { name: "Add transaction" }).getByRole("button", { name: "Close" }).click();

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("personal capture creates a transaction that Money can edit and delete", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    const txName = `E2E personal coffee ${Date.now()}`;
    await page.goto("/");
    await openCaptureControl(page);
    const capture = page.getByRole("dialog", { name: "Add transaction" });
    await expect(capture).toBeVisible();
    const destination = capture.getByLabel("Save to");
    if (await destination.count()) await destination.selectOption("personal");
    await capture.getByLabel("Amount", { exact: true }).fill("7.89");
    await capture.getByLabel("What was it for?").fill(txName);
    await capture.getByRole("button", { name: "Save expense" }).click();
    await expect(capture).toBeHidden({ timeout: 15_000 });

    await page.goto("/money");
    await page.getByRole("tab", { name: "Transactions" }).click();
    await expect(page.getByText(txName).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: new RegExp(escapeRegExp(txName)) }).first().click();

    const editDialog = page.getByRole("dialog", { name: "Edit transaction" });
    await expect(editDialog).toBeVisible();
    await expectDialogInViewport(page, editDialog);
    const editedName = `${txName} edited`;
    await editDialog.getByLabel("Description").fill(editedName);
    await editDialog.getByLabel("Amount").fill("8.91");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.getByText(editedName).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: new RegExp(escapeRegExp(editedName)) }).first().click();
    const deleteDialog = page.getByRole("dialog", { name: "Edit transaction" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await deleteDialog.getByRole("button", { name: "Tap again to confirm" }).click();
    await expect(page.getByText(editedName).first()).toBeHidden({ timeout: 15_000 });

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("numa OS drafts an entry into the viewed day and shows it in the catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    const merchant = `e2e espresso ${Date.now() % 100000}`;
    await page.goto("/numa");
    await expect(page.getByText(/spent today|spent/i).first()).toBeVisible({ timeout: 15_000 });

    // Bare quick-add → Propose card → Execute (aiActionDrafts audit path).
    const composer = page.getByLabel("Message Numa");
    await composer.fill(`${merchant} 4.20`);
    await composer.press("Enter");
    await expect(page.getByText("propose", { exact: false })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Yes, do it" }).click();
    await expect(page.getByText(/^Done\./).first()).toBeVisible({ timeout: 15_000 });

    // The entry lands on the VIEWED day: hero brief + entries row update live.
    await expect(page.getByText(merchant).first()).toBeVisible({ timeout: 15_000 });

    // Zoom out — the same entry sits in the catalog grid as a tile.
    await page.getByRole("button", { name: "See all days" }).click();
    await expect(page.getByRole("heading", { name: "All days" })).toBeVisible();
    await expect(page.getByText(merchant).first()).toBeVisible({ timeout: 15_000 });

    // Tile tap flows back into the thread (shared-element morph target).
    await page.getByRole("button", { name: new RegExp(escapeRegExp(merchant)) }).first().click();
    await expect(page.getByLabel("Message Numa")).toBeVisible({ timeout: 10_000 });

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("old wealth add links open the right dialog on the home", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    await page.goto("/wealth?add=asset");
    const assetDialog = page.getByRole("dialog", { name: "New asset" });
    await expect(assetDialog).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expectDialogInViewport(page, assetDialog);
    await assetDialog.getByLabel("Name").fill("QA Cash Account");
    await assetDialog.getByLabel("Balance").fill("123");
    await expect(assetDialog.getByRole("button", { name: "Add asset" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(assetDialog).toBeHidden();

    await page.goto("/?add=liability");
    const liabilityDialog = page.getByRole("dialog", { name: "New liability" });
    await expect(liabilityDialog).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expectDialogInViewport(page, liabilityDialog);
    await page.keyboard.press("Escape");
    await expect(liabilityDialog).toBeHidden();

    await page.goto("/?add=holding");
    const holdingDialog = page.getByRole("dialog", { name: "Add an investment" });
    await expect(holdingDialog).toBeVisible();
    await expectDialogInViewport(page, holdingDialog);
    await page.keyboard.press("Escape");
    await expect(holdingDialog).toBeHidden();

    // The fake "connect your bank" picker is gone; ?add=account opens a plain account.
    await page.goto("/?add=account");
    const accountDialog = page.getByRole("dialog", { name: "New asset" });
    await expect(accountDialog).toBeVisible();
    await expect(accountDialog.getByLabel("Kind")).toHaveValue("cash");
    await page.keyboard.press("Escape");
    await expect(accountDialog).toBeHidden();

    await page.goto("/?add=wallet");
    const walletDialog = page.getByRole("dialog", { name: "Track a public wallet" });
    await expect(walletDialog).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expectDialogInViewport(page, walletDialog);
    await expect(walletDialog.getByText("Public address only")).toBeVisible();
    await walletDialog
      .getByLabel("Wallet address")
      .fill("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu");
    await walletDialog.getByRole("button", { name: "Track wallet" }).click();
    await expect(
      walletDialog.getByText("This looks like a recovery phrase or private key. Nothing was sent or saved.")
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(walletDialog).toBeHidden();

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("holdings can be edited and deleted from the detail panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    // Create a holding to operate on. A per-run ticker keeps leftovers from an
    // earlier failed run on the reused QA account out of the way.
    const ticker = `QA${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
    await page.goto("/?add=holding");
    const addDialog = page.getByRole("dialog", { name: "Add an investment" });
    await expect(addDialog).toBeVisible();
    await addDialog.getByRole("button", { name: "Enter details myself" }).click();
    await addDialog.getByLabel("Symbol").fill(ticker);
    await addDialog.getByLabel("Quantity").fill("2");
    await addDialog.getByLabel("Total paid").fill("800");
    await addDialog.getByRole("button", { name: "Add holding" }).click();
    await expect(addDialog).toBeHidden();

    // Tap its row on the home to open the detail dialog.
    await page.getByRole("button", { name: new RegExp(`^${ticker}, .*Edit$`) }).click();
    const editTrigger = page.getByRole("button", { name: "Edit holding" });
    await expect(editTrigger).toBeVisible();

    // Edit: dialog opens prefilled; correct the quantity and save.
    await editTrigger.click();
    const editDialog = page.getByRole("dialog", { name: "Edit holding" });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByLabel("Quantity")).toHaveValue("2");
    await editDialog.getByLabel("Quantity").fill("7");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();

    // Delete: two-step confirm; the detail dialog closes on success.
    await page.getByRole("button", { name: "Delete holding" }).click();
    await page.getByRole("button", { name: "Confirm delete holding" }).click();
    await expect(page.getByRole("button", { name: "Edit holding" })).toBeHidden();

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("settings appearance, palette, language, and mode controls persist", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectPageErrors(page);
    await chooseAppMode(page, "advanced");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    await page.getByRole("button", { name: "Light" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");

    await page.getByRole("button", { name: /Carbon/ }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.themeKey))
      .toBe("carbon");
    await page.getByRole("button", { name: /Citrus/ }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.themeKey))
      .toBe("citrus");

    const languageSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="ru"]') })
      .first();
    await languageSelect.selectOption("ru");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("numa:locale")))
      .toBe("ru");
    await expect(page.locator("body")).toContainText("Язык");
    await languageSelect.selectOption("en");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("numa:locale")))
      .toBe("en");
    // The select persists the locale to the cloud profile asynchronously, and
    // every later spec re-hydrates locale from that profile on sign-in. The
    // push is fire-and-forget, so first give the in-flight mutation time to
    // commit (reloading immediately would sever the socket and drop it), then
    // verify the cloud actually holds "en" (reload → hydration writes the
    // profile value back into localStorage). Without this a lost write leaves
    // the rest of the suite rendering Russian.
    await page.waitForTimeout(1500);
    await expect
      .poll(
        async () => {
          await page.reload();
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(1200);
          return page.evaluate(() => window.localStorage.getItem("numa:locale"));
        },
        { timeout: 20_000 }
      )
      .toBe("en");

    await chooseAppMode(page, "light");
    await chooseAppMode(page, "advanced");

    await expectNoHorizontalOverflow(page);
    expect(errors()).toEqual([]);
  });

  test("shared mobile pod accepts a card label and expense", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseAppMode(page, "shared");
    await gotoAndSettle(page, "/pod");
    const podName = await ensurePodExists(page);
    await expect(page.getByRole("heading", { name: podName })).toBeVisible();

    const cardName = `E2E Card ${Date.now()}`;
    await page.getByRole("button", { name: "People and cards" }).click();
    const peopleDialog = page.getByRole("dialog", {
      name: /People & cards|Pot settings|Люди и карты|Настройки пота|Personas y tarjetas|Ajustes del bote/
    });
    await expect(peopleDialog).toBeVisible();
    await expectDialogInViewport(page, peopleDialog);
    await expectLocatorOnTop(page, peopleDialog);
    await peopleDialog
      .getByPlaceholder("Card label, e.g. Revolut")
      .first()
      .fill(cardName);
    await peopleDialog.getByRole("button", { name: "Add" }).first().click();
    await expect(page.getByText(cardName).first()).toBeVisible();
    await peopleDialog.getByRole("button", { name: "Close" }).click();

    const expenseName = `E2E groceries ${Date.now()}`;
    await page.getByLabel("Add expense").click();
    const dialog = page.getByRole("dialog", { name: "Add shared expense" });
    await expect(dialog).toBeVisible();
    await expectDialogInViewport(page, dialog);
    await expectLocatorOnTop(page, dialog);
    await dialog.locator('input[placeholder="0.00"]').fill("12.34");
    await dialog
      .locator('input[placeholder^="What was it?"]')
      .fill(expenseName);
    const cardChip = dialog.getByRole("button", { name: cardName });
    if (await cardChip.isVisible().catch(() => false)) {
      await cardChip.click();
    }
    await dialog.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByRole("button", { name: `Edit ${expenseName}` })).toBeVisible();

    const editedName = `${expenseName} edited`;
    await page.getByRole("button", { name: `Edit ${expenseName}` }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit expense" });
    await expect(editDialog).toBeVisible();
    await expectDialogInViewport(page, editDialog);
    await expectLocatorOnTop(page, editDialog);
    await editDialog.locator('input[placeholder="0.00"]').fill("23.45");
    await editDialog.locator('input[placeholder^="What was it?"]').fill(editedName);
    await editDialog.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByRole("button", { name: `Edit ${editedName}` })).toBeVisible();

    await page.getByRole("button", { name: `Edit ${editedName}` }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Edit expense" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(deleteDialog.getByText(`Delete "${editedName}"?`)).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete expense" }).click();
    await expect(page.getByRole("button", { name: `Edit ${editedName}` })).toBeHidden();
  });

  test("advanced goals support adding a contribution", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseAppMode(page, "advanced");
    await page.goto("/goals");

    // Create a (net-worth) goal.
    const goalName = `E2E Goal ${Date.now()}`;
    await page.getByRole("button", { name: "New goal" }).first().click();
    const goalDialog = page.getByRole("dialog", { name: "New goal" });
    await expect(goalDialog).toBeVisible();
    await goalDialog.getByLabel("Goal name (optional)").fill(goalName);
    await goalDialog.getByLabel(/^Target/).fill("5000");
    await goalDialog.getByRole("button", { name: "Set goal" }).click();
    await expect(goalDialog).toBeHidden({ timeout: 15_000 });

    // The card now carries an Add control; contributing saves without error.
    await page.getByRole("button", { name: `Add to ${goalName}` }).first().click();
    const addDialog = page.getByRole("dialog", { name: `Add to ${goalName}` });
    await expect(addDialog).toBeVisible();
    await addDialog.getByLabel("Amount to add").fill("250");
    await addDialog.getByRole("button", { name: /^Add / }).click();
    await expect(addDialog).toBeHidden({ timeout: 15_000 });
  });

  test("owner sees a two-step Delete pot control in Pot settings", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseAppMode(page, "shared");
    await gotoAndSettle(page, "/pod");
    await ensurePodExists(page);

    await page.getByRole("button", { name: "People and cards" }).click();
    const peopleDialog = page.getByRole("dialog", {
      name: /People & cards|Pot settings|Люди и карты|Настройки пота|Personas y tarjetas|Ajustes del bote/
    });
    await expect(peopleDialog).toBeVisible();

    // Owner sees the destructive control at the foot of the sheet.
    const deleteBtn = peopleDialog.getByRole("button", { name: "Delete pot", exact: true });
    await deleteBtn.scrollIntoViewIfNeeded();
    await expect(deleteBtn).toBeVisible();

    // First click arms a confirm; Cancel reverts without deleting (we do NOT
    // confirm — this account's pod must survive for the rest of the suite).
    await deleteBtn.click();
    const confirmBtn = peopleDialog.getByRole("button", { name: "Confirm delete pot" });
    await expect(confirmBtn).toBeVisible();
    await peopleDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmBtn).toBeHidden();
    await expect(
      peopleDialog.getByRole("button", { name: "Delete pot", exact: true })
    ).toBeVisible();
    // The owner gets Delete, never Leave (leaving is a non-owner action).
    await expect(peopleDialog.getByRole("button", { name: "Leave pot" })).toBeHidden();
  });

  test("owner can assign themselves to a group", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseAppMode(page, "shared");
    await gotoAndSettle(page, "/pod");
    await ensurePodExists(page);

    await page.getByRole("button", { name: "People and cards" }).click();
    const peopleDialog = page.getByRole("dialog", {
      name: /People & cards|Pot settings|Люди и карты|Настройки пота|Personas y tarjetas|Ajustes del bote/
    });
    await expect(peopleDialog).toBeVisible();

    // The owner's own row ("You") now carries a group dropdown — the selector
    // used to be shown for everyone EXCEPT the owner.
    const ownerRow = peopleDialog.locator("li").filter({ hasText: "You" }).first();
    const groupSelect = ownerRow.getByRole("combobox");
    await groupSelect.scrollIntoViewIfNeeded();
    await expect(groupSelect).toBeVisible();

    // Assign self to the first real group; the choice sticks.
    await groupSelect.selectOption({ index: 1 });
    await expect(groupSelect).not.toHaveValue("");
  });

  test("sign-out returns to the welcome surface", async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSettings(page);
    await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
    if (isDisposableQaAccount()) {
      const deleteAccountButton = page
        .locator("#settings-data-controls")
        .getByRole("button", {
          name: /Delete this account|Удалить этот аккаунт|Eliminar esta cuenta/
        });
      await deleteAccountButton.scrollIntoViewIfNeeded();
      await expectInViewport(page, deleteAccountButton);
      await expectLocatorOnTop(page, deleteAccountButton);
      await deleteAccountButton.click();
      const deleteDialog = page.getByRole("dialog", {
        name: /Delete this account\?|Удалить этот аккаунт\?|¿Eliminar esta cuenta\?/
      });
      await expect(deleteDialog).toBeVisible();
      await expectDialogInViewport(page, deleteDialog);
      await deleteDialog.getByPlaceholder("DELETE").fill("DELETE");
      await deleteDialog
        .getByRole("button", {
          name: /Delete (this )?account|Удалить этот аккаунт|Eliminar esta cuenta/
        })
        .click();
      await expect(page).toHaveURL(/\/welcome/);
      await expect(page.getByRole("button", { name: LOGIN_EMAIL_RE })).toBeVisible();
      await page.waitForTimeout(500);
      expect(errors()).toEqual([]);
      return;
    }
    await page.getByRole("button", { name: /^(Sign out|Выйти|Cerrar sesión)$/ }).first().click();
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole("button", { name: LOGIN_EMAIL_RE })).toBeVisible();
    await page.waitForTimeout(500);
    expect(errors()).toEqual([]);
  });
});

async function gotoAndSettle(page: Page, route: string) {
  try {
    await page.goto(route, { waitUntil: "commit" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/interrupted by another navigation|frame load interrupted/i.test(message)) throw error;
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

async function signInWithEmail(page: Page, testInfo: { project: { name: string } }) {
  const credentials = e2eCredentialsForProject(testInfo.project.name);
  await page.goto("/welcome");
  await clearBrowserState(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Numa" })).toBeVisible();
  await page.getByRole("button", { name: LOGIN_EMAIL_RE }).click();

  if (E2E_CREATE_QA_ACCOUNT && !createdQaAccounts.has(credentials.email) && !E2E_EMAIL) {
    await page.getByRole("button", { name: CREATE_ACCOUNT_RE }).click();
    await page.getByLabel(NAME_LABEL_RE).fill("Numa QA");
    await page.getByLabel(EMAIL_LABEL_RE).fill(credentials.email);
    await page.getByLabel(PASSWORD_LABEL_RE).fill(credentials.password);
    await submitAuthForm(page, "signUp");
    if (new URL(page.url()).pathname === "/welcome") {
      const errorText = await authErrorText(page);
      await page.locator("form").getByRole("button", { name: SIGN_IN_RE }).first().click();
      await page.getByLabel(EMAIL_LABEL_RE).fill(credentials.email);
      await page.getByLabel(PASSWORD_LABEL_RE).fill(credentials.password);
      await submitAuthForm(page, "signIn");
      if (new URL(page.url()).pathname === "/welcome" && errorText) {
        throw new Error(`QA account creation did not leave welcome: ${errorText}`);
      }
    }
    if (new URL(page.url()).pathname !== "/welcome") {
      createdQaAccounts.add(credentials.email);
    }
  } else {
    await page.getByLabel(EMAIL_LABEL_RE).fill(credentials.email);
    await page.getByLabel(PASSWORD_LABEL_RE).fill(credentials.password);
    await submitAuthForm(page, "signIn");
  }
  await completeOnboardingIfNeeded(page);
  // Most authenticated specs assert English copy, but a prior spec (settings
  // persistence) may have written ru/es to the cloud profile, which hydration
  // re-applies on every fresh sign-in. Pin this session to English so spec
  // order and profile state can't flip the UI language mid-suite.
  await page.evaluate(() => {
    window.localStorage.setItem("numa:locale", "en");
    window.dispatchEvent(new CustomEvent("numa:locale", { detail: "en" }));
  });
}

function e2eCredentialsForProject(projectName: string) {
  if (E2E_EMAIL && E2E_PASSWORD) {
    return { email: E2E_EMAIL, password: E2E_PASSWORD };
  }
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    email: `numa-e2e+${E2E_RUN_ID}-${projectSlug}@example.com`,
    password: E2E_PASSWORD_VALUE
  };
}

async function submitAuthForm(page: Page, flow: "signIn" | "signUp") {
  const form = page.locator("form").first();
  const submitButton = form.locator('button[type="submit"]');
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await page.waitForTimeout(150);
  await page
    .waitForFunction(
      ({ flowName, errorPattern }) => {
        if (window.location.pathname !== "/welcome") return true;
        const submit = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
        const buttonText = submit?.textContent ?? "";
        const stillSubmitting =
          submit?.disabled ||
          (flowName === "signUp"
            ? /creating|созда|creando/i.test(buttonText)
            : /signing|вход|entrando/i.test(buttonText));
        const pageText = document.body.textContent ?? "";
        return !stillSubmitting && new RegExp(errorPattern, "i").test(pageText);
      },
      { flowName: flow, errorPattern: AUTH_ERROR_RE.source },
      { timeout: 20_000 }
    )
    .catch(async () => {
      const path = new URL(page.url()).pathname;
      const errorText = await authErrorText(page);
      throw new Error(
        `Email auth ${flow} did not complete from ${path}${errorText ? `: ${errorText}` : ""}`
      );
    });
}

async function authErrorText(page: Page) {
  return page
    .locator("p")
    .filter({ hasText: AUTH_ERROR_RE })
    .last()
    .textContent({ timeout: 1_000 })
    .then((text) => text?.trim() ?? "")
    .catch(() => "");
}

async function completeOnboardingIfNeeded(page: Page) {
  await page.waitForLoadState("domcontentloaded");

  for (let step = 0; step < 10; step += 1) {
    const path = new URL(page.url()).pathname;
    if (path === "/onboarding/style") {
      await page.waitForURL(/\/onboarding\/mode$/);
      continue;
    }

    if (path === "/onboarding/mode") {
      await page.getByRole("button", { name: /^Shared pot/ }).click();
      await expect(page).toHaveURL(/\/onboarding\/setup$/);
      continue;
    }

    if (path === "/onboarding/setup") {
      await page.getByRole("button", { name: /^Continue with/ }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
      continue;
    }

    if (path === "/onboarding/ready") {
      await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
      continue;
    }

    if (path !== "/welcome" && !path.startsWith("/onboarding")) return;
    await page.waitForTimeout(200);
  }

  const finalPath = new URL(page.url()).pathname;
  if (finalPath === "/welcome" || finalPath.startsWith("/onboarding")) {
    throw new Error(`Onboarding did not finish, still on ${finalPath}`);
  }
}

async function ensurePodExists(page: Page): Promise<string> {
  const createButton = page.getByRole("button", { name: "Create the pot" });
  const peopleButton = page.getByRole("button", { name: "People and cards" });
  const peopleRailButton = page.getByRole("button", { name: "People" });
  const settingsNavButton = page.getByRole("button", { name: "Settings" });
  const sharedReadyButton = peopleButton.or(peopleRailButton).or(settingsNavButton);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await createButton.isVisible().catch(() => false)) {
      const name = `E2E Home ${Date.now()}`;
      await page.getByLabel("Pot name").fill(name);
      await createButton.click();
      await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
      await expect(sharedReadyButton.first()).toBeVisible({ timeout: 15_000 });
      return name;
    }
    if (await sharedReadyButton.first().isVisible().catch(() => false)) {
      const heading = page.locator("h1:visible").first();
      await expect(heading).toBeVisible();
      return (await heading.textContent())?.trim() || "Shared pot";
    }
    await page.waitForTimeout(250);
  }
  await expect(createButton.or(sharedReadyButton).first()).toBeVisible();
  return "Shared pot";
}

const MODE_BUTTON_NAMES = {
  light: /^(Light|Simple|Простой)$/i,
  advanced: /^(Advanced|Avanzado|Полный)$/i,
  shared: /^(Shared pot|Bote compartido|Общий пот)$/i
} as const;

const MODE_SHEET_BUTTON_NAMES = {
  light: /Light|Simple|Простой/i,
  advanced: /Advanced|Avanzado|Полный/i,
  shared: /Shared Pot|Bote compartido|Общий пот/i
} as const;

async function chooseAppMode(page: Page, mode: keyof typeof MODE_BUTTON_NAMES) {
  await openSettings(page);
  await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
  await expectNoHorizontalOverflow(page);
  const currentMode = await page.evaluate(() => document.documentElement.dataset.mode);
  if (currentMode === mode) return;

  const referenceSwitch = page.locator("button").filter({ hasText: /current mode/i }).first();
  const hasReferenceSwitch = await referenceSwitch
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (hasReferenceSwitch) {
    await referenceSwitch.click();
    const modeSheet = page.getByRole("dialog", { name: "Switch mode" });
    await expect(modeSheet).toBeVisible();
    await modeSheet.getByRole("button", { name: MODE_SHEET_BUTTON_NAMES[mode] }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.mode))
      .toBe(mode);
    const doneButton = modeSheet.getByRole("button", { name: "Done" });
    if (await doneButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await doneButton.click({ timeout: 2_000 }).catch(() => undefined);
    }
    return;
  } else if (currentMode === "light") {
    await page.getByRole("button", { name: /Switch/ }).click();
    const modeSheet = page.getByRole("dialog", { name: "Switch mode" });
    await expect(modeSheet).toBeVisible();
    await modeSheet.getByRole("button", { name: MODE_SHEET_BUTTON_NAMES[mode] }).click();
  } else {
    await settingsModeCard(page).getByRole("button", { name: MODE_BUTTON_NAMES[mode] }).click();
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.mode))
    .toBe(mode);
}

async function openSettings(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await gotoAndSettle(page, "/settings");
    if (new URL(page.url()).pathname === "/settings") return;
    await page.waitForTimeout(250);
  }
  await expect(page).toHaveURL(/\/settings$/);
}

function settingsModeCard(page: Page) {
  return page
    .locator(".nm-card-container")
    .filter({ hasText: /Mode|Режим|Modo/ })
    .first();
}

async function expectRouteHealthy(page: Page, route: string) {
  await gotoAndSettle(page, route);
  await expect(page.locator("body")).not.toContainText("Unexpected Application Error");
  await expect(page.locator("body")).not.toContainText("404 Not Found");
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function visibleNavHrefs(page: Page) {
  return page.locator('nav a[href]').evaluateAll((links) =>
    Array.from(
      new Set(
        links
          .filter((link) => {
            const rect = link.getBoundingClientRect();
            const style = window.getComputedStyle(link);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
          })
          .map((link) => new URL((link as HTMLAnchorElement).href).pathname)
      )
    )
  );
}

async function expectVisiblePrimaryNav(page: Page, present: string[], absent: string[] = []) {
  await expect
    .poll(() => visibleNavHrefs(page))
    .toEqual(expect.arrayContaining(present));
  const hrefs = await visibleNavHrefs(page);
  for (const href of present) {
    expect(hrefs).toContain(href);
  }
  for (const href of absent) {
    expect(hrefs).not.toContain(href);
  }
}

async function openCaptureControl(page: Page) {
  const control = page
    .getByRole("button", { name: "Capture", exact: true })
    .or(page.getByRole("button", { name: "Add", exact: true }))
    .or(page.getByRole("button", { name: "Add transaction", exact: true }))
    .or(page.getByRole("button", { name: "Add movement", exact: true }))
    .or(page.getByRole("button", { name: "Add first movement", exact: true }))
    .first();
  await expect(control).toBeVisible({ timeout: 15_000 });
  await control.click();
}

async function clearBrowserState(page: Page) {
  await page.context().clearCookies();
  if (page.url() === "about:blank") {
    await page.goto("/welcome");
  }
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    const message = error.message;
    // WebKit emits this exact pageerror when an in-flight resource load is
    // aborted by rapid SPA navigation. Route-health assertions below still
    // catch real user-visible failures; keep lazy-import and Convex errors.
    if (message === "TypeError: Load failed") return;
    errors.push(message);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|manifest/i.test(text)) return;
    errors.push(text);
  });
  return () => errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDisposableQaAccount() {
  return E2E_CREATE_QA_ACCOUNT && !E2E_EMAIL;
}

async function expectMainControlsInViewport(page: Page) {
  const boxes = await page.locator("input, button").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
      })
      .map((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      })
  );
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  }
}

async function expectDialogInViewport(
  page: Page,
  dialog: Locator
) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
}

async function expectInViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
}

async function expectLocatorOnTop(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const point = {
    x: box!.x + box!.width / 2,
    y: box!.y + Math.min(box!.height / 2, 120)
  };
  const isTop = await locator.evaluate((element, p) => {
    const top = document.elementFromPoint(p.x, p.y);
    return Boolean(top && element.contains(top));
  }, point);
  expect(isTop).toBe(true);
}
