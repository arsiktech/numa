import { expect, test } from "@playwright/test";

for (const method of ["getItem", "setItem"] as const) {
  test(`stale bundle recovery survives denied cooldown ${method}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let documentRequests = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
    });
    await page.addInitScript((blockedMethod) => {
      const original = Storage.prototype[blockedMethod];
      Object.defineProperty(Storage.prototype, blockedMethod, {
        configurable: true,
        value: function (this: Storage, ...args: string[]) {
          if (args[0] === "numa:asset-reload-at") {
            throw new DOMException("Storage unavailable", "SecurityError");
          }
          return Reflect.apply(original, this, args);
        }
      });
    }, method);

    const login = page.getByRole("button", { name: /Login with email|Войти по email|Entrar con email/i });
    const coldStart = Date.now();
    await page.goto("/welcome");
    await expect(login).toBeVisible();
    const coldMs = Date.now() - coldStart;
    const recoveryStart = Date.now();
    await Promise.all([
      page.waitForEvent("domcontentloaded"),
      page.evaluate(() => {
        // Concurrent failures must result in one real navigation, even when
        // persisting or reading the cross-navigation cooldown is unavailable.
        window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
        window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
      })
    ]);
    await expect(login).toBeVisible();
    console.log(`Welcome cold=${coldMs}ms recovery=${Date.now() - recoveryStart}ms`);
    expect(documentRequests).toBe(2);
    await login.click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
