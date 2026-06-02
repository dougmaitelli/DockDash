import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import i18next, { type ParseKeys, type Resource } from "i18next";
import { config } from "../lib/config.js";

// In dev, import.meta.url points to src/server/i18n/index.ts → locales/ is a sibling subdir.
// In production, the esbuild bundle is at dist/server/index.js → i18n/locales/ is copied by build.
const base = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.join(base, "locales"), path.join(base, "i18n/locales")];
const i18nDir = candidates.find((p) => fs.existsSync(path.join(p, "en.json"))) ?? candidates[0];

const resources: Resource = {};

for (const file of fs.readdirSync(i18nDir).filter((f) => f.endsWith(".json"))) {
  const lang = file.replace(".json", "");
  const translation = JSON.parse(fs.readFileSync(path.join(i18nDir, file), "utf-8"));

  resources[lang] = { translation };
}

await i18next.init({
  lng: config.locale,
  fallbackLng: "en",
  resources,
  interpolation: { escapeValue: false },
});

export function t(key: ParseKeys, vars?: Record<string, string>, lang?: string): string {
  return i18next.t(key, { lng: lang, ...vars });
}
