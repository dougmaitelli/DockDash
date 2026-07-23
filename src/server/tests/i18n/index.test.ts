import { t } from "@server/i18n/index.js";
import { config } from "@server/lib/config.js";
import i18next from "i18next";
import { describe, expect, it } from "vitest";

describe("server i18n", () => {
  it("initializes i18next with the configured locale and English fallback", () => {
    expect(i18next.language).toBe(config.locale);
    expect(i18next.options.fallbackLng).toEqual(["en"]);
  });

  it("registers the English and Brazilian Portuguese resources", () => {
    expect(i18next.hasResourceBundle("en", "translation")).toBe(true);
    expect(i18next.hasResourceBundle("pt-BR", "translation")).toBe(true);
  });

  it("translates using an explicit language override", () => {
    expect(t("notifications.updateAvailable", undefined, "en")).toBe("⚠️ Update Available");
    expect(t("notifications.updateAvailable", undefined, "pt-BR")).toBe(
      "⚠️ Atualização Disponível",
    );
  });

  it("falls back to English for an unsupported language", () => {
    expect(t("notifications.testTitle", undefined, "fr")).toBe("Test Notification");
  });

  it("interpolates variables without escaping their values", () => {
    expect(t("notifications.serviceDown", { name: "<DockDash>" }, "en")).toBe(
      "⚠️ Service Down: <DockDash>",
    );
    expect(
      t(
        "notifications.updateEntry",
        { name: "DockDash", currentVersion: "1.0", latestVersion: "2.0" },
        "en",
      ),
    ).toBe("DockDash: 1.0 → 2.0");
  });
});
