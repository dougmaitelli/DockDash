import { defineConfig } from "@playwright/test";

import config from "./playwright.config.js";

export default defineConfig({
  ...config,
  testDir: "./scripts",
  testMatch: "take-screenshots.ts",
  timeout: 60_000,
  outputDir: "test-results/docs",
  reporter: [["list"]],
  projects: [{ name: "docs", use: { ...config.projects![0].use } }],
});
