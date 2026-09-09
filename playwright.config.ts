import { defineConfig } from "@playwright/test";

process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // The server has one isolated database; reset it before each test.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  updateSnapshots: "none",
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 0 },
  },
  snapshotPathTemplate: "{testDir}/snapshots/{projectName}/{arg}{ext}",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8099",
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    contextOptions: { reducedMotion: "reduce" },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-dark", use: { viewport: { width: 1400, height: 900 }, colorScheme: "dark" } },
    {
      name: "desktop-light",
      use: { viewport: { width: 1400, height: 900 }, colorScheme: "light" },
    },
  ],
  webServer: {
    command: "node --import tsx scripts/start-e2e.ts",
    // Wait for this process to bind successfully, rather than accepting an
    // unrelated service already listening on the test port.
    wait: { stdout: /DockDash server running on http:\/\/localhost:8099/ },
    timeout: 120_000,
  },
});
