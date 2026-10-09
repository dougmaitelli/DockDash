import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.js";
import { openService } from "./screens.js";

async function flushRendering(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function openFiles(page: Page) {
  await page.route("**/api/services/*/files?*", (route) =>
    route.fulfill({
      json: {
        path: "/",
        entries: ["a.txt", "b.txt"].map((name) => ({
          name,
          type: "file",
          size: 10,
          permissions: "-rw-------",
          modified: "today",
        })),
      },
    }),
  );
  await openService(page);
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(page.getByText("a.txt", { exact: true })).toBeVisible();
}

for (const staleReadFails of [false, true]) {
  test(`ignores stale file read ${staleReadFails ? "errors" : "content"} after opening another file`, async ({
    page,
  }) => {
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    let written: unknown;

    await page.route("**/api/services/*/files/content*", async (route) => {
      if (route.request().method() === "PUT") {
        written = route.request().postDataJSON();
        await route.fulfill({ json: { success: true } });

        return;
      }

      const path = new URL(route.request().url()).searchParams.get("path");

      if (path === "/a.txt") {
        requested();
        await gate;
      }

      await route.fulfill(
        path === "/a.txt" && staleReadFails
          ? { status: 500, json: { error: "stale failure" } }
          : { json: { path, content: path === "/a.txt" ? "content A" : "content B" } },
      );
    });
    await openFiles(page);
    await page.getByText("a.txt", { exact: true }).click();
    await started;
    await page.getByText("b.txt", { exact: true }).click();
    await expect(page.locator("textarea")).toHaveValue("content B");
    const staleResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get("path") === "/a.txt",
    );

    release();
    await (await staleResponse).finished();
    await flushRendering(page);
    await expect(page.locator("textarea")).toHaveValue("content B");
    await expect(page.getByText("stale failure", { exact: true })).toHaveCount(0);
    await page.locator("textarea").fill("edited B");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(written).toEqual({ path: "/b.txt", content: "edited B" });
  });
}

for (const staleSaveFails of [false, true]) {
  test(`ignores stale save ${staleSaveFails ? "errors" : "completion"} after navigating`, async ({
    page,
  }) => {
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });

    await page.route("**/api/services/*/files/content*", async (route) => {
      if (route.request().method() === "PUT") {
        requested();
        await gate;
        await route.fulfill(
          staleSaveFails
            ? { status: 500, json: { error: "stale save failure" } }
            : { json: { success: true } },
        );

        return;
      }

      const path = new URL(route.request().url()).searchParams.get("path");

      await route.fulfill({ json: { path, content: `content ${path}` } });
    });
    await openFiles(page);
    await page.getByText("a.txt", { exact: true }).click();
    await page.locator("textarea").fill("edited A");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await started;
    await page.getByText("b.txt", { exact: true }).click();
    await page.locator("textarea").fill("edited B");
    const response = page.waitForResponse((res) => res.request().method() === "PUT");

    release();
    await (await response).finished();
    await flushRendering(page);
    await expect(page.locator("textarea")).toHaveValue("edited B");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
    await expect(page.getByText("stale save failure", { exact: true })).toHaveCount(0);
  });
}

test("keeps edits made during a save dirty", async ({ page }) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let written: unknown;

  await page.route("**/api/services/*/files/content*", async (route) => {
    if (route.request().method() === "PUT") {
      written = route.request().postDataJSON();
      requested();
      await gate;
      await route.fulfill({ json: { success: true } });

      return;
    }

    const path = new URL(route.request().url()).searchParams.get("path");

    await route.fulfill({ json: { path, content: "original" } });
  });
  await openFiles(page);
  await page.getByText("a.txt", { exact: true }).click();
  await page.locator("textarea").fill("saved snapshot");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await started;
  await page.locator("textarea").fill("newer edit");
  const response = page.waitForResponse((res) => res.request().method() === "PUT");

  release();
  await (await response).finished();
  await flushRendering(page);
  expect(written).toEqual({ path: "/a.txt", content: "saved snapshot" });
  await expect(page.locator("textarea")).toHaveValue("newer edit");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});
