import { expect, type Page, test as base } from "@playwright/test";
import path from "node:path";

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, request, baseURL, colorScheme }, use) => {
      const reset = await request.post("/__test/reset", { data: {} });

      expect(reset.ok()).toBeTruthy();
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const url = route.request().url();

        if (url.startsWith(baseURL + "/") || url.startsWith("data:")) return route.continue();

        const isServiceIcon = url.match(
          /^https:\/\/cdn\.jsdelivr\.net\/gh\/homarr-labs\/dashboard-icons\/svg\/(grafana|nginx|postgresql|prometheus|redis|traefik)\.svg$/,
        );

        if (isServiceIcon)
          return route.fulfill({
            path: path.join(import.meta.dirname, "assets/mock-icon.svg"),
            contentType: "image/svg+xml",
          });

        errors.push(`Unexpected external request: ${url}`);
        await route.abort();
      });
      await page.clock.setFixedTime(new Date("2026-08-16T12:00:00.000Z"));
      await page.addInitScript((theme) => {
        if (!localStorage.getItem("dockdash-theme")) localStorage.setItem("dockdash-theme", theme);
      }, colorScheme ?? "dark");
      await use();
      expect(errors, "Browser exceptions and unexpected external requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function navigate(page: Page, name: string) {
  await expect(page.getByRole("navigation")).toBeVisible();

  await page.getByRole("link", { name, exact: true }).filter({ visible: true }).click();
}

export async function screenshot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
  });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // Keep application styling intact; finish transitions before comparing pixels.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(name, { fullPage });
}
