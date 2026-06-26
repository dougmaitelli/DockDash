import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Separator } from "@/components/ui/Separator";

import { useConfig } from "../context/ConfigContext";
import { useTheme } from "../context/ThemeContext";
import { discoveryApi } from "../services/api";
import type { ThemeSelection } from "../styles/themes";
import { themeSelections } from "../styles/themes";

type TestState = "idle" | "sending" | "sent" | "failed";

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

  const configEntries = [
    { key: "DOCKER_HOSTS", value: config?.dockerHosts.join(", ") },
    { key: "NETWORK_CIDRS", value: config?.networkCidrs.join(",") },
    { key: "REFRESH_INTERVAL", value: String(config?.refreshInterval ?? "") },
    { key: "HEALTH_CHECK_INTERVAL", value: String(config?.healthCheckInterval ?? "") },
  ];

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
            <Select value={theme} onValueChange={(v) => setTheme(v as ThemeSelection)}>
              <SelectTrigger id="theme-select" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themeSelections.map(({ key, label }) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
