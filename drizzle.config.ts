import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/lib/schema/index.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./dockdash.db",
  },
});
