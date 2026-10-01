// Explicit documentation export; never compares or updates regression baselines.
import { mkdir } from "node:fs/promises";

import { prepareScreenshot, test } from "../e2e/fixtures.js";
import {
  expectServicesLayout,
  openDashboard,
  openService,
  showCertificate,
  showResources,
  showServiceTab,
} from "../e2e/screens.js";

test("export documentation screenshots", async ({ page }) => {
  await mkdir("screenshots", { recursive: true });
  const capture = async (number: number) => {
    await prepareScreenshot(page);
    await page.screenshot({
      path: `screenshots/${number}.png`,
      animations: "disabled",
      caret: "hide",
    });
  };

  await openDashboard(page);
  await capture(1);
  await openService(page);
  await showCertificate(page);
  await capture(2);
  await showResources(page);
  await capture(3);
  await showServiceTab(page, "Changelog");
  await capture(5);
  await showServiceTab(page, "Files");
  await capture(6);
  await showServiceTab(page, "Terminal");
  await capture(7);
  await page.goto("/services");
  await test.expect(page.locator("tbody tr")).toHaveCount(6);
  await expectServicesLayout(page);
  await capture(4);
});
