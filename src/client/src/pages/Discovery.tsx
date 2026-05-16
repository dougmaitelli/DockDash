import { useState } from "react";
import styled from "styled-components";
import { colors } from "../styles/theme";
import { IconPlus, IconX } from "../utils/Icons";
import { useDiscovery, useDockerHealth } from "../hooks/useData";
import { discoveryApi } from "../services/api";
import { Service, ServiceSource, ServiceStatus } from "@shared";

const Page = styled.div`
  padding: 24px;
  max-width: 1200px;
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
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 4px;
  color: #e8eaf0;
`;

const SectionDesc = styled.p`
  font-size: 0.85rem;
  color: #6b7290;
  margin-bottom: 20px;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 10px 20px;
  border: 1px solid #2d3348;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  color: #9ca3b8;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CIDRInput = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
`;

const CIDRTagsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const CIDRInputRow = styled.div`
  display: flex;
  gap: 10px;
`;

const CIDRTag = styled.span`
  padding: 4px 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 16px;
  font-size: 0.8rem;
  color: #3b82f6;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RemoveTag = styled.button`
  background: none;
  border: none;
  color: #9ca3b8;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  line-height: 1;

  &:hover {
    color: #ef4444;
  }
`;

const CIDRInputField = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #2d3348;
  border-radius: 6px;
  background: #0f1117;
  color: #e8eaf0;
  font-size: 0.85rem;
  outline: none;

  &:focus {
    border-color: #3b82f6;
  }
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
  background: #0f1117;
  border: 1px solid #2d3348;
  border-radius: 8px;
  transition: border-color 0.15s;

  &:hover {
    border-color: #3d4460;
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
  color: #e8eaf0;
`;

const ResultMeta = styled.div`
  font-size: 0.75rem;
  color: #6b7290;
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
  background: ${(props) => (props.ok ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)")};
  color: ${(props) => (props.ok ? colors.accentGreen : colors.accentRed)};
`;

const Tag = styled.span<{ bg: string; color: string }>`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => props.bg};
  color: ${(props) => props.color};
`;

export default function Discovery() {
  const { services, refresh, importFromDiscovery, importService } = useDiscovery();
  const { health } = useDockerHealth();

  const [scanning, setScanning] = useState<string | null>(null);
  const [dockerResults, setDockerResults] = useState<Service[]>([]);
  const [networkResults, setNetworkResults] = useState<Service[]>([]);
  const [cidrs, setCidrs] = useState<string[]>(["192.168.1.0/24"]);
  const [newCidr, setNewCidr] = useState("");
  const [cidrError, setCidrError] = useState("");
  const [scanPorts, setScanPorts] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDockerScan = async () => {
    setScanning("docker");
    setDockerResults([]);
    try {
      const res = await importFromDiscovery(ServiceSource.DOCKER);
      setDockerResults(res.services);
      showToast(`Discovered ${res.discovered} Docker containers`);
      await refresh();
    } catch (e) {
      showToast(`Docker scan failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setScanning(null);
  };

  const handleNetworkScan = async () => {
    setScanning("network");
    setNetworkResults([]);
    try {
      const res = await discoveryApi.networkScan(
        cidrs,
        scanPorts ? scanPorts.split(",").map(Number) : undefined,
      );
      setNetworkResults(res.data.services);
      showToast(`Discovered ${res.data.discovered} network services`);
      await refresh();
    } catch (e) {
      showToast(`Network scan failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setScanning(null);
  };

  const isValidCIDR = (value: string) => {
    const parts = value.split("/");
    if (parts.length !== 2) return false;
    const [ip, prefix] = parts;
    const prefixNum = parseInt(prefix, 10);
    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return false;
    const octets = ip.split(".");
    if (octets.length !== 4) return false;
    return octets.every((o) => {
      const n = parseInt(o, 10);
      return !isNaN(n) && n >= 0 && n <= 255 && String(n) === o;
    });
  };

  const addCidr = () => {
    if (!newCidr) return;
    if (!isValidCIDR(newCidr)) {
      setCidrError("Invalid CIDR — expected format: 192.168.1.0/24");
      return;
    }
    if (cidrs.includes(newCidr)) {
      setCidrError("This CIDR is already in the list");
      return;
    }
    setCidrs([...cidrs, newCidr]);
    setNewCidr("");
    setCidrError("");
  };

  const removeCidr = (index: number) => {
    setCidrs(cidrs.filter((_, i) => i !== index));
  };

  const existingIds = new Set(services.map((s) => s.id));
  const availableDocker = dockerResults.filter((s) => !existingIds.has(s.id));
  const availableNetwork = networkResults.filter((s) => !existingIds.has(s.id));

  return (
    <Page>
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 70,
            right: 24,
            background: "#1e2230",
            border: "1px solid #2d3348",
            borderRadius: 8,
            padding: "10px 20px",
            color: "#e8eaf0",
            fontSize: "0.85rem",
            zIndex: 200,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {toast}
        </div>
      )}

      <Section>
        <SectionTitle>🐳 Docker Container Scan</SectionTitle>
        <SectionDesc>
          Scan the Docker socket for running containers on the host or remote Docker host
        </SectionDesc>
        <div style={{ marginBottom: 12 }}>
          {health ? (
            health.connected ? (
              <StatusBadge ok={true}>
                ✓ Connected — {health.serverVersion} ({health.containersRunning} running /{" "}
                {health.containers} total)
              </StatusBadge>
            ) : (
              <StatusBadge ok={false}>✕ Not Connected — {health.error}</StatusBadge>
            )
          ) : (
            <StatusBadge ok={false}>Checking...</StatusBadge>
          )}
        </div>
        <ButtonRow>
          <PrimaryButton onClick={handleDockerScan} disabled={scanning === "docker"}>
            {scanning === "docker" ? "⏳ Scanning..." : "⚡ Scan Docker"}
          </PrimaryButton>
        </ButtonRow>

        {dockerResults.length > 0 && (
          <ResultList>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#6b7290",
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Found {dockerResults.length} containers</span>
              <span>{availableDocker.length} not on dashboard</span>
            </div>
            {dockerResults.map((svc) => {
              const imported = existingIds.has(svc.id);
              return (
                <ResultItem key={svc.id}>
                  <ResultInfo>
                    <ResultName>
                      <StatusDot status={svc.status} /> {svc.name}
                    </ResultName>
                    <ResultMeta>
                      <Tag bg="rgba(139, 92, 246, 0.1)" color={colors.accentPurple}>
                        Docker
                      </Tag>
                      {svc.host}
                      {svc.port && `:${svc.port}`}
                      <Tag bg="rgba(245, 158, 11, 0.1)" color={colors.accentYellow}>
                        {svc.protocol}
                      </Tag>
                    </ResultMeta>
                  </ResultInfo>
                  {imported ? (
                    <Tag bg="rgba(16, 185, 129, 0.15)" color={colors.accentGreen}>
                      ✓ On Dashboard
                    </Tag>
                  ) : (
                    <SecondaryButton
                      onClick={() => {
                        importService({
                          name: svc.name,
                          host: svc.host,
                          port: svc.port,
                          protocol: svc.protocol,
                          source: ServiceSource.DOCKER,
                          status: svc.status,
                          metadata: svc.metadata,
                        });
                      }}
                    >
                      + Import
                    </SecondaryButton>
                  )}
                </ResultItem>
              );
            })}
          </ResultList>
        )}
      </Section>

      <Section>
        <SectionTitle>🌐 Network Scan</SectionTitle>
        <SectionDesc>Scan CIDR ranges for non-Docker services on your local network</SectionDesc>
        <CIDRInput>
          {cidrs.length > 0 && (
            <CIDRTagsRow>
              {cidrs.map((c, i) => (
                <CIDRTag key={i}>
                  {c}
                  <RemoveTag onClick={() => removeCidr(i)}>
                    <IconX size={13} />
                  </RemoveTag>
                </CIDRTag>
              ))}
            </CIDRTagsRow>
          )}
          <CIDRInputRow>
            <CIDRInputField
              value={newCidr}
              onChange={(e) => {
                setNewCidr(e.target.value);
                setCidrError("");
              }}
              placeholder="Add CIDR (e.g., 10.0.0.0/8)"
              onKeyDown={(e) => e.key === "Enter" && addCidr()}
              style={cidrError ? { borderColor: colors.accentRed } : undefined}
            />
            <SecondaryButton onClick={addCidr}>
              <IconPlus size={14} /> Add
            </SecondaryButton>
          </CIDRInputRow>
          {cidrError && (
            <span style={{ fontSize: "0.75rem", color: colors.accentRed }}>{cidrError}</span>
          )}
        </CIDRInput>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{ fontSize: "0.75rem", color: "#6b7290", marginBottom: 4, display: "block" }}
          >
            Scan Ports
          </label>
          <CIDRInputField
            value={scanPorts}
            onChange={(e) => setScanPorts(e.target.value)}
            placeholder="Comma-separated ports"
          />
        </div>
        <ButtonRow>
          <PrimaryButton onClick={handleNetworkScan} disabled={scanning === "network"}>
            {scanning === "network" ? "⏳ Scanning..." : "⚡ Scan Network"}
          </PrimaryButton>
        </ButtonRow>

        {networkResults.length > 0 && (
          <ResultList>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#6b7290",
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Found {networkResults.length} services</span>
              <span>{availableNetwork.length} not on dashboard</span>
            </div>
            {networkResults.map((svc) => {
              const imported = existingIds.has(svc.id);
              return (
                <ResultItem key={svc.id}>
                  <ResultInfo>
                    <ResultName>
                      <StatusDot status={svc.status} /> {svc.name}
                    </ResultName>
                    <ResultMeta>
                      <Tag bg="rgba(16, 185, 129, 0.1)" color={colors.accentGreen}>
                        Network
                      </Tag>
                      {svc.host}
                      {svc.port && `:${svc.port}`}
                    </ResultMeta>
                  </ResultInfo>
                  {imported ? (
                    <Tag bg="rgba(16, 185, 129, 0.15)" color={colors.accentGreen}>
                      ✓ On Dashboard
                    </Tag>
                  ) : (
                    <SecondaryButton
                      onClick={() => {
                        importService({
                          name: svc.name,
                          host: svc.host,
                          port: svc.port,
                          protocol: svc.protocol,
                          source: ServiceSource.NETWORK,
                          status: svc.status,
                          metadata: svc.metadata,
                        });
                      }}
                    >
                      + Import
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
