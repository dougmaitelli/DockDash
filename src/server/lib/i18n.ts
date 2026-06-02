import i18next from "i18next";
import { config } from "./config.js";
import en from "../i18n/en.json" with { type: "json" };

await i18next.init({
  lng: config.locale,
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

export function t(key: string, vars?: Record<string, string>, lang?: string): string {
  return i18next.t(key, { lng: lang, ...vars });
}
