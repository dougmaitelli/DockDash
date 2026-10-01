import { type Page } from "@playwright/test";

import { IDS } from "../scripts/fixtures/ui.js";
import { expect } from "./fixtures.js";

export async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-service-id]")).toHaveCount(6);
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await expect(page.locator("[data-link-id]")).toHaveCount(5);
}

export async function openService(page: Page, id: string = IDS.traefik) {
  await page.goto("/");
  await page.locator(`[data-service-id="${id}"]`).dblclick();
  await expect(page.locator("[data-drawer]")).toBeVisible();
  await expect(page.getByText("Health History", { exact: true })).toBeVisible();
}

export async function showCertificate(page: Page) {
  await page.getByRole("button", { name: /Certificate$/ }).click();
  await expect(page.getByText("dashboard.example.com:443")).toBeVisible();
  await page
    .locator("[data-drawer] .overflow-y-auto")
    .evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
}

export async function showResources(page: Page) {
  await page.getByRole("button", { name: /Certificate$/ }).click();
  await page
    .locator("[data-drawer] .overflow-y-auto")
    .evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  await expect(page.getByText("Resource Monitor", { exact: true })).toBeVisible();
}

export async function showServiceTab(
  page: Page,
  tab: "Changelog" | "Files" | "Terminal",
  prompt = "root@traefik",
) {
  await page.getByRole("button", { name: tab, exact: true }).click();

  if (tab === "Changelog") {
    await expect(
      page.getByText("Improve WebSocket proxy performance under high connection load"),
    ).toBeVisible();
  } else if (tab === "Files") {
    await expect(page.getByText("traefik", { exact: true }).last()).toBeVisible();
  } else {
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.locator(".xterm-rows")).toContainText(prompt);
    await page.getByRole("button", { name: "Terminal", exact: true }).focus();
  }
}

// Check cell boundaries as well as pixels so long source labels cannot overlap names.
export async function expectServicesLayout(page: Page) {
  await expect(page.locator("tbody tr")).toHaveCount(6);
  const layout = await page.locator("tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const sourceCell = row.children[0];
      const source = sourceCell.querySelector("span")!;
      const dashboard = row.lastElementChild!.querySelector("span")!;
      const text = document.createRange();

      text.selectNodeContents(dashboard.lastChild!);

      return {
        sourceFits:
          source.getBoundingClientRect().right <= sourceCell.getBoundingClientRect().right,
        dashboardLines: text.getClientRects().length,
        dashboardFits:
          dashboard.getBoundingClientRect().left >=
          row.lastElementChild!.getBoundingClientRect().left,
      };
    }),
  );

  for (const row of layout) {
    expect(row.sourceFits).toBeTruthy();
    expect(row.dashboardLines).toBe(1);
    expect(row.dashboardFits).toBeTruthy();
  }
}
