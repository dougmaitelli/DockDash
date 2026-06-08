import { initReactI18next } from "react-i18next";
import i18n from "i18next";

const modules = import.meta.glob("./locales/*.json", { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Record<string, { translation: Record<string, unknown> }> = {};

for (const [path, mod] of Object.entries(modules)) {
  const lang = path.match(/\/([^/]+)\.json$/)?.[1];

  if (lang) resources[lang] = { translation: mod.default };
}

i18n.use(initReactI18next).init({
  lng: navigator.language,
  fallbackLng: "en",
  resources,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
