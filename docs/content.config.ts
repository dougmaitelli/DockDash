import { docsSchema } from "@astrojs/starlight/schema";
import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: ".",
      pattern: ["**/*.{md,mdx}", "!node_modules/**", "!ARCHITECTURE.md", "!RELEASING.md"],
    }),
    schema: docsSchema(),
  }),
};
