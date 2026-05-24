import { useState, useEffect } from "react";
import styled from "styled-components";
import { colors } from "../styles/theme";
import { discoveryApi } from "../services/api";
import type { DashboardConfig } from "../types";

const Page = styled.div`
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const Section = styled.div`
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
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

export default function Settings() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    discoveryApi.getConfig().then((res) => setConfig(res.data));
  }, []);

  return (
    <Page>
      <Section>
        <SectionTitle>⚙️ Environment Variables</SectionTitle>
        <HelpText>
          These settings are configured via environment variables when starting the container.
          Changes require a container restart.
        </HelpText>

        <div style={{ marginTop: 16 }}>
          <ConfigItem>
            <ConfigKey>DOCKER_HOST</ConfigKey>
            <ConfigValue>{config?.dockerHost}</ConfigValue>
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
