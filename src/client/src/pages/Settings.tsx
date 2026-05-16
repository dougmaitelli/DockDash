import styled from "styled-components";

const Page = styled.div`
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const Section = styled.div`
  background: #1e2230;
  border: 1px solid #2d3348;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: #e8eaf0;
`;

const ConfigItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid #2d3348;
`;

const ConfigKey = styled.label`
  font-size: 0.85rem;
  color: #9ca3b8;
  min-width: 160px;
`;

const ConfigValue = styled.code`
  font-size: 0.8rem;
  color: #3b82f6;
  background: #0f1117;
  padding: 4px 10px;
  border-radius: 4px;
  word-break: break-all;
`;

const HelpText = styled.p`
  font-size: 0.8rem;
  color: #6b7290;
  line-height: 1.6;
  margin-top: 8px;
`;

export default function Settings() {
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
            <ConfigValue>unix:///var/run/docker.sock</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>NETWORK_CIDRS</ConfigKey>
            <ConfigValue>192.168.1.0/24</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>SCAN_PORTS</ConfigKey>
            <ConfigValue>80,443,3000,3001,5432,6379,8080,8443,9090</ConfigValue>
          </ConfigItem>
          <ConfigItem>
            <ConfigKey>REFRESH_INTERVAL</ConfigKey>
            <ConfigValue>30000</ConfigValue>
          </ConfigItem>
        </div>
      </Section>
    </Page>
  );
}
