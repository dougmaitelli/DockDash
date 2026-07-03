import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: ["src/server/tests/**", "src/server/index.ts"],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@server": path.resolve(import.meta.dirname, "src/server"),
    },
  },
});
