import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { colors } from "../styles/vars";
import { Icons } from "../utils/Icons";
import { PrimaryButton, SecondaryButton, PortTag, Section, StyledInput } from "../utils/ui";
import { TagArrayInput } from "../utils/TagArrayInput";
import { useDiscovery, useDockerHealth } from "../hooks/useData";
import { startScanStream } from "../services/scanStream";
import { useConfig } from "../context/ConfigContext";
import { Service, ServiceSource, ServiceStatus } from "@shared";

const Page = styled.div`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: ${colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SectionDesc = styled.p`
  font-size: 0.85rem;
  color: ${colors.textMuted};
  margin-bottom: 20px;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const ResultList = styled.div`
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ResultItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${colors.bgPrimary};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${colors.borderHover};
  }
`;

const ResultInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ResultName = styled.div`
  font-size: 0.85rem;
  font-weight: 500;
  color: ${colors.textPrimary};
`;

const ResultMeta = styled.div`
  font-size: 0.75rem;
  color: ${colors.textMuted};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatusDot = styled.span<{ status: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) =>
    props.status === ServiceStatus.UP
      ? colors.accentGreen
      : props.status === ServiceStatus.DOWN
        ? colors.accentRed
        : colors.textMuted};
`;

const StatusBadge = styled.span<{ ok: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 0.8rem;
  background: ${(props) => (props.ok ? colors.accentGreenAlpha15 : colors.accentRedAlpha15)};
  color: ${(props) => (props.ok ? colors.accentGreen : colors.accentRed)};
`;

const Tag = styled.span<{ bg: string; color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => props.bg};
  color: ${(props) => props.color};
`;

export default function Discovery() {
  const { t } = useTranslation();
  const { services, refresh, importService } = useDiscovery();
  const { health } = useDockerHealth();
  const appConfig = useConfig();

  const [scanningDocker, setScanningDocker] = useState(false);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [dockerResults, setDockerResults] = useState<Service[]>([]);
  const [networkResults, setNetworkResults] = useState<Service[]>([]);
  const [cidrs, setCidrs] = useState<string[]>([]);
  const [scanPorts, setScanPorts] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const dockerScanRef = useRef<EventSource | null>(null);
  const networkScanRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (appConfig) setCidrs(appConfig.networkCidrs);
  }, [appConfig]);

  useEffect(() => {
    return () => {
      dockerScanRef.current?.close();
      networkScanRef.current?.close();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDockerScan = () => {
    setScanningDocker(true);
    setDockerResults([]);

    dockerScanRef.current = startScanStream({
      url: "/api/docker/scan/stream",
      onService: (svc) => setDockerResults((prev) => [...prev, svc]),
      onDone: async (count) => {
        setScanningDocker(false);
        showToast(t("discovery.toastDockerDone", { count }));
        await refresh();
      },
      onError: (msg) => {
        setScanningDocker(false);
        showToast(t("discovery.toastDockerFailed", { message: msg }));
      },
    });
  };

  const handleNetworkScan = () => {
    setScanningNetwork(true);
    setNetworkResults([]);

    const params = new URLSearchParams({ cidrs: cidrs.join(",") });

    if (scanPorts) params.set("ports", scanPorts);

    networkScanRef.current = startScanStream({
      url: `/api/network/scan/stream?${params}`,
      onService: (svc) => setNetworkResults((prev) => [...prev, svc]),
      onDone: async (count) => {
        setScanningNetwork(false);
        showToast(t("discovery.toastNetworkDone", { count }));
        await refresh();
      },
      onError: (msg) => {
        setScanningNetwork(false);
        showToast(t("discovery.toastNetworkFailed", { message: msg }));
      },
    });
  };

  const validateCidr = (value: string, existing: string[]) => {
    const parts = value.split("/");

    if (parts.length !== 2) return t("discovery.invalidCidr");

    const [ip, prefix] = parts;
    const prefixNum = parseInt(prefix, 10);

    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return t("discovery.invalidCidr");

    const octets = ip.split(".");

    if (octets.length !== 4) return t("discovery.invalidCidr");

    const valid = octets.every((o) => {
      const n = parseInt(o, 10);

      return !isNaN(n) && n >= 0 && n <= 255 && String(n) === o;
    });

    if (!valid) return t("discovery.invalidCidr");

    if (existing.includes(value)) return t("discovery.duplicateCidr");

    return null;
  };

  const availableDocker = dockerResults.filter((s) => !services.some((e) => Service.equals(s, e)));
  const availableNetwork = networkResults.filter(
    (s) => !services.some((e) => Service.equals(s, e)),
  );

  const handleImportAllDocker = async () => {
    await Promise.all(
      availableDocker.map((svc) =>
        importService({
          name: svc.name,
          host: svc.host,
          ports: svc.ports,
          source: ServiceSource.DOCKER,
          metadata: svc.metadata,
        }),
      ),
    );
    showToast(t("discovery.toastImported", { count: availableDocker.length }));
  };

  const handleImportAllNetwork = async () => {
    await Promise.all(
      availableNetwork.map((svc) =>
        importService({
          name: svc.name,
          host: svc.host,
          ports: svc.ports,
          source: ServiceSource.NETWORK,
          metadata: svc.metadata,
        }),
      ),
    );
    showToast(t("discovery.toastImported", { count: availableNetwork.length }));
  };

  return (
    <Page>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 70,
            right: 24,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "10px 20px",
            color: colors.textPrimary,
            fontSize: "0.85rem",
            zIndex: 200,
            boxShadow: `0 4px 20px ${colors.blackAlpha40}`,
          }}
        >
          {toast}
        </div>
      )}

      <Section>
        <SectionTitle>
          <Icons.Docker size={18} /> {t("discovery.dockerTitle")}
        </SectionTitle>
        <SectionDesc>{t("discovery.dockerDesc")}</SectionDesc>
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          {health ? (
            health.map((h) =>
              h.connected ? (
                <StatusBadge key={h.host} ok={true}>
                  <Icons.Check size={12} />
                  {h.host} —{" "}
                  {t("discovery.connected", {
                    version: h.serverVersion,
                    running: h.containersRunning,
                    total: h.containers,
                  })}
                </StatusBadge>
              ) : (
                <StatusBadge key={h.host} ok={false}>
                  <Icons.X size={12} />
                  {h.host} — {t("discovery.notConnected", { error: h.error })}
                </StatusBadge>
              ),
            )
          ) : (
            <StatusBadge ok={false}>{t("discovery.checking")}</StatusBadge>
          )}
        </div>
        <ButtonRow>
          <PrimaryButton
            onClick={handleDockerScan}
            disabled={scanningDocker || !health?.some((h) => h.connected)}
          >
            <Icons.Scan size={14} />
            {scanningDocker ? t("discovery.scanning") : t("discovery.scanDocker")}
          </PrimaryButton>
          {availableDocker.length > 0 && !scanningDocker && (
            <SecondaryButton onClick={handleImportAllDocker}>
              {t("discovery.importAll", { count: availableDocker.length })}
            </SecondaryButton>
          )}
        </ButtonRow>

        {dockerResults.length > 0 && (
          <ResultList>
            <div
              style={{
                fontSize: "0.8rem",
                color: colors.textMuted,
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{t("discovery.foundContainers", { count: dockerResults.length })}</span>
              <span>{t("discovery.notOnDashboard", { count: availableDocker.length })}</span>
            </div>
            {dockerResults.map((svc) => {
              const imported = services.some((e) => Service.equals(svc, e));

              return (
                <ResultItem key={svc.id}>
                  <ResultInfo>
                    <ResultName>
                      <StatusDot status={svc.status} /> {svc.name}
                    </ResultName>
                    <ResultMeta>
                      <Tag bg={colors.accentPurpleAlpha10} color={colors.accentPurple}>
                        {t("discovery.tagDocker")}
                      </Tag>
                      {svc.host}
                      {svc.ports?.map((p) => (
                        <PortTag key={p}>:{p}</PortTag>
                      ))}
                    </ResultMeta>
                  </ResultInfo>
                  {imported ? (
                    <Tag bg={colors.accentGreenAlpha15} color={colors.accentGreen}>
                      <Icons.Check size={11} /> {t("discovery.onDashboard")}
                    </Tag>
                  ) : (
                    <SecondaryButton
                      onClick={() => {
                        importService({
                          name: svc.name,
                          host: svc.host,
                          ports: svc.ports,
                          source: ServiceSource.DOCKER,
                          metadata: svc.metadata,
                        });
                      }}
                    >
                      <Icons.Plus size={14} /> {t("discovery.importOne")}
                    </SecondaryButton>
                  )}
                </ResultItem>
              );
            })}
          </ResultList>
        )}
      </Section>

      <Section>
        <SectionTitle>
          <Icons.Globe size={18} /> {t("discovery.networkTitle")}
        </SectionTitle>
        <SectionDesc>{t("discovery.networkDesc")}</SectionDesc>
        <div style={{ marginBottom: 16 }}>
          <TagArrayInput
            values={cidrs}
            onChange={setCidrs}
            validate={validateCidr}
            placeholder={t("discovery.cidrPlaceholder")}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              fontSize: "0.75rem",
              color: colors.textMuted,
              marginBottom: 4,
              display: "block",
            }}
          >
            {t("discovery.scanPortsLabel")}
          </label>
          <StyledInput
            value={scanPorts}
            onChange={(e) => setScanPorts(e.target.value)}
            placeholder={t("discovery.portsPlaceholder")}
          />
        </div>
        <ButtonRow>
          <PrimaryButton onClick={handleNetworkScan} disabled={scanningNetwork}>
            <Icons.Scan size={14} />
            {scanningNetwork ? t("discovery.scanning") : t("discovery.scanNetwork")}
          </PrimaryButton>
          {availableNetwork.length > 0 && !scanningNetwork && (
            <SecondaryButton onClick={handleImportAllNetwork}>
              {t("discovery.importAll", { count: availableNetwork.length })}
            </SecondaryButton>
          )}
        </ButtonRow>

        {networkResults.length > 0 && (
          <ResultList>
            <div
              style={{
                fontSize: "0.8rem",
                color: colors.textMuted,
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{t("discovery.foundServices", { count: networkResults.length })}</span>
              <span>{t("discovery.notOnDashboard", { count: availableNetwork.length })}</span>
            </div>
            {networkResults.map((svc) => {
              const imported = services.some((e) => Service.equals(svc, e));

              return (
                <ResultItem key={svc.id}>
                  <ResultInfo>
                    <ResultName>
                      <StatusDot status={svc.status} /> {svc.name}
                    </ResultName>
                    <ResultMeta>
                      <Tag bg={colors.accentGreenAlpha10} color={colors.accentGreen}>
                        {t("discovery.tagNetwork")}
                      </Tag>
                      {svc.host}
                      {svc.ports?.map((p) => (
                        <PortTag key={p}>:{p}</PortTag>
                      ))}
                    </ResultMeta>
                  </ResultInfo>
                  {imported ? (
                    <Tag bg={colors.accentGreenAlpha15} color={colors.accentGreen}>
                      <Icons.Check size={11} /> {t("discovery.onDashboard")}
                    </Tag>
                  ) : (
                    <SecondaryButton
                      onClick={() => {
                        importService({
                          name: svc.name,
                          host: svc.host,
                          ports: svc.ports,
                          source: ServiceSource.NETWORK,
                          metadata: svc.metadata,
                        });
                      }}
                    >
                      <Icons.Plus size={14} /> {t("discovery.importOne")}
                    </SecondaryButton>
                  )}
                </ResultItem>
              );
            })}
          </ResultList>
        )}
      </Section>
    </Page>
  );
}
