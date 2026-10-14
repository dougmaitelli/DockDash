import { expect, test } from "./fixtures.js";

test("batch assigns labels to filtered services and preserves existing labels", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/services")).json();

  await page.goto("/services");
  await page.getByPlaceholder("Search by name, host, label, or port…").fill("Production");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("checkbox", { name: "Select all visible services" }).check();
  await expect(page.getByText("4 selected", { exact: true })).toBeVisible();
  await expect(page.locator("[data-drawer]")).toHaveCount(0);
  await page.getByRole("combobox").fill("Batch group");
  await page.getByRole("combobox").press("Enter");
  const batchRequests: string[] = [];

  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/services/labels"))
      batchRequests.push(req.url());

    expect(req.method() === "PUT" && /\/api\/services\//.test(req.url())).toBeFalsy();
  });
  await page.getByRole("button", { name: "Assign labels", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0);
  expect(batchRequests).toHaveLength(1);
  const after = await (await request.get("/api/services")).json();

  for (const service of before) {
    const updated = after.find((candidate: { id: string }) => candidate.id === service.id);
    const selected = service.labels.some((label: string) => label.toLowerCase() === "production");

    expect([...updated.labels].sort()).toEqual(
      (selected ? [...service.labels, "Batch group"] : [...service.labels]).sort(),
    );
  }

  await page.reload();
  await page.getByPlaceholder("Search by name, host, label, or port…").fill("Batch group");
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("failed batch label assignment keeps the entire selection for retry", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/services")).json();

  await page.goto("/services");
  await expect(page.locator("tbody tr")).toHaveCount(6);
  const rows = page.locator("tbody tr");

  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  let rejected = false;

  await page.route("**/api/services/labels", async (route) => {
    if (route.request().method() === "POST" && !rejected) {
      rejected = true;
      await route.fulfill({ status: 500, json: { error: "Test failure" } });
    } else await route.continue();
  });
  await page.getByRole("combobox").fill("Retry group");
  await page.getByRole("combobox").press("Enter");
  await page.getByRole("button", { name: "Assign labels", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No labels were assigned.");
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  const afterFailure = await (await request.get("/api/services")).json();

  expect(afterFailure.map((service: { labels: string[] }) => service.labels)).toEqual(
    before.map((service: { labels: string[] }) => service.labels),
  );
  await page.getByRole("button", { name: "Assign labels", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0);
});
