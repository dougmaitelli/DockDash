import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: [
        "src/server/index.ts",
        "src/server/tests/**",
        "src/server/db/schema/**",
        "src/server/types/**",
        "src/server/mockEntry.ts",
        "src/server/services/mock/**",
      ],
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
