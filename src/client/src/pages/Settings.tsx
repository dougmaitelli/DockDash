import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type ClientSchemaConfig,
  CONFIG_SCHEMA,
  type ConfigKey,
  type SchemaEntry,
} from "@shared/configSchema";

import { Select } from "@/components/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Separator } from "@/components/ui/Separator";

import { useConfig } from "../context/ConfigContext";
import { useTheme } from "../context/ThemeContext";
import { discoveryApi } from "../services/api";
import type { ThemeSelection } from "../styles/themes";
import { themeSelections } from "../styles/themes";

type TestState = "idle" | "sending" | "sent" | "failed";

function formatMs(ms: number): string {
  if (ms % 3600_000 === 0) return `${ms / 3_600_000}h`;

  if (ms % 60_000 === 0) return `${ms / 60_000}m`;

  if (ms % 1_000 === 0) return `${ms / 1_000}s`;

  return `${ms}ms`;
}

export default function Settings() {
  const { t } = useTranslation();
  const config = useConfig();
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  const handleTestNotification = async () => {
    setTestState("sending");
    setTestError(null);

    try {
      await discoveryApi.testNotification();
      setTestState("sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";

      setTestError(msg);
      setTestState("failed");
    } finally {
      setTimeout(() => setTestState("idle"), 5000);
    }
  };

  const configEntries = (Object.entries(CONFIG_SCHEMA) as [ConfigKey, SchemaEntry][])
    .filter(([, entry]) => entry.showOnUi && entry.type !== "boolean-disable")
    .map(([key, entry]) => {
      const value = config?.[key as keyof ClientSchemaConfig];
      let formatted = "";

      if (value != null) {
        if (entry.format === "ms") formatted = formatMs(value as number);
        else if (entry.type === "string-array") formatted = (value as string[]).join(", ");
        else formatted = String(value);
      }

      return { key: entry.env, value: formatted };
    });

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="theme-select" className="text-secondary-foreground whitespace-nowrap">
              {t("settings.colorTheme")}
            </Label>
            <Select
              id="theme-select"
              className="w-48"
              value={theme}
              onValueChange={(v) => setTheme(v as ThemeSelection)}
              options={themeSelections.map(({ key, label }) => ({ value: key, label }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.notificationsTitle")}</CardTitle>
          <CardDescription>{t("settings.notificationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          <Separator />
          <div className="flex items-center justify-between py-3">
            <Label className="text-secondary-foreground">{t("settings.notificationsStatus")}</Label>
            <div className="flex items-center gap-3">
              <Badge variant={config?.appriseConfigured ? "success" : "secondary"}>
                {config?.appriseConfigured
                  ? t("settings.notificationsConfigured")
                  : t("settings.notificationsNotConfigured")}
              </Badge>
              {config?.appriseConfigured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={testState === "sending"}
                >
                  {testState === "sent"
                    ? t("settings.notificationsTestSent")
                    : testState === "failed"
                      ? t("settings.notificationsTestFailed")
                      : t("settings.notificationsTest")}
                </Button>
              )}
            </div>
          </div>
          {testState === "failed" && testError && (
            <p className="text-sm text-destructive mt-1">{testError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>⚙️ {t("settings.envVarsTitle")}</CardTitle>
          <CardDescription>{t("settings.envVarsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0">
          {configEntries.map(({ key, value }, i) => (
            <div key={key}>
              {i > 0 && <Separator />}
              <div className="flex justify-between items-center py-3">
                <Label className="text-secondary-foreground min-w-40">{key}</Label>
                <code className="text-xs text-primary bg-background px-2.5 py-1 rounded font-mono break-all">
                  {value}
                </code>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {config?.version && (
        <p className="text-center text-xs text-muted-foreground/50 pb-2">
          DockDash {config.version}
        </p>
      )}
    </div>
  );
}
