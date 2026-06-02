import { useState } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { colors } from "../styles/vars";
import { discoveryApi } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { useConfig } from "../context/ConfigContext";
import { themeSelections } from "../styles/themes";
import type { ThemeSelection } from "../styles/themes";
import { StyledSelect, Section, SecondaryButton } from "../utils/ui";

const Page = styled.div`
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: ${colors.textPrimary};
`;

const ConfigItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid ${colors.border};
`;

const ConfigKey = styled.label`
  font-size: 0.85rem;
  color: ${colors.textSecondary};
  min-width: 160px;
`;

const ConfigValue = styled.code`
  font-size: 0.8rem;
  color: ${colors.accentBlue};
  background: ${colors.bgPrimary};
  padding: 4px 10px;
  border-radius: 4px;
  word-break: break-all;
`;

const HelpText = styled.p`
  font-size: 0.8rem;
  color: ${colors.textMuted};
  line-height: 1.6;
  margin-top: 8px;
`;

const NotificationStatusBadge = styled.span<{ $configured: boolean }>`
  font-size: 0.8rem;
  color: ${({ $configured }) => ($configured ? colors.accentGreen : colors.textMuted)};
`;

const NotificationRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${colors.border};
`;

const ThemeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
`;

const ThemeLabel = styled.label`
  font-size: 0.85rem;
  color: ${colors.textSecondary};
  white-space: nowrap;
`;

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

  return (
    <Page>
      <Section>
        <SectionTitle>{t("settings.appearance")}</SectionTitle>
        <ThemeRow>
          <ThemeLabel htmlFor="theme-select">{t("settings.colorTheme")}</ThemeLabel>
          <StyledSelect
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeSelection)}
          >
            {themeSelections.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </StyledSelect>
        </ThemeRow>
      </Section>

      <Section>
        <SectionTitle>{t("settings.notificationsTitle")}</SectionTitle>
        <HelpText>{t("settings.notificationsDesc")}</HelpText>

        <div style={{ marginTop: 16 }}>
          <NotificationRow>
            <ConfigKey>{t("settings.notificationsStatus")}</ConfigKey>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <NotificationStatusBadge $configured={!!config?.appriseConfigured}>
                {config?.appriseConfigured
                  ? t("settings.notificationsConfigured")
                  : t("settings.notificationsNotConfigured")}
              </NotificationStatusBadge>
              {config?.appriseConfigured && (
                <SecondaryButton
                  onClick={handleTestNotification}
                  disabled={testState === "sending"}
                >
                  {testState === "sent"
                    ? t("settings.notificationsTestSent")
                    : testState === "failed"
                      ? t("settings.notificationsTestFailed")
                      : t("settings.notificationsTest")}
                </SecondaryButton>
              )}
            </div>
          </NotificationRow>
          {testState === "failed" && testError && (
            <HelpText style={{ color: colors.accentRed, marginTop: 8 }}>{testError}</HelpText>
          )}
        </div>
      </Section>

      <Section>
        <SectionTitle>⚙️ {t("settings.envVarsTitle")}</SectionTitle>
        <HelpText>{t("settings.envVarsDesc")}</HelpText>

        <div style={{ marginTop: 16 }}>
          <ConfigItem>
            <ConfigKey>DOCKER_HOSTS</ConfigKey>
            <ConfigValue>{config?.dockerHosts.join(", ")}</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>NETWORK_CIDRS</ConfigKey>
            <ConfigValue>{config?.networkCidrs.join(",")}</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>SCAN_PORTS</ConfigKey>
            <ConfigValue>{config?.scanPorts.join(",")}</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>REFRESH_INTERVAL</ConfigKey>
            <ConfigValue>{config?.refreshInterval}</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>HEALTH_CHECK_INTERVAL</ConfigKey>
            <ConfigValue>{config?.healthCheckInterval}</ConfigValue>
          </ConfigItem>
        </div>
      </Section>
    </Page>
  );
}
