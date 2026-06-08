import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Service, ServiceSource, ServiceStatus } from "@shared";

import { Icons } from "@/components/Icons";
import { PortTag } from "@/components/PortTag";
import { TagArrayInput } from "@/components/TagArrayInput";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

import { useConfig } from "../context/ConfigContext";
import { useDiscovery, useDockerHealth } from "../hooks/useData";
import { startScanStream } from "../services/scanStream";

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full inline-block shrink-0",
        status === ServiceStatus.UP
          ? "bg-success"
          : status === ServiceStatus.DOWN
            ? "bg-destructive"
            : "bg-muted-foreground",
      )}
    />
  );
}

function StatusBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
        ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

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
    <div className="p-6 max-w-[1200px] mx-auto">
      {toast && (
        <div className="fixed top-[70px] right-6 z-[200] bg-card border border-border rounded-lg px-5 py-2.5 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <Card className="mb-5">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-1 text-foreground flex items-center gap-2">
            <Icons.Docker size={18} /> {t("discovery.dockerTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">{t("discovery.dockerDesc")}</p>
          <div className="mb-3 flex flex-col items-start gap-1">
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
          <div className="flex gap-2.5 flex-wrap">
            <Button
              variant="default"
              onClick={handleDockerScan}
              disabled={scanningDocker || !health?.some((h) => h.connected)}
            >
              <Icons.Scan size={14} />
              {scanningDocker ? t("discovery.scanning") : t("discovery.scanDocker")}
            </Button>
            {availableDocker.length > 0 && !scanningDocker && (
              <Button variant="outline" onClick={handleImportAllDocker}>
                {t("discovery.importAll", { count: availableDocker.length })}
              </Button>
            )}
          </div>

          {dockerResults.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground mb-1 flex justify-between">
                <span>{t("discovery.foundContainers", { count: dockerResults.length })}</span>
                <span>{t("discovery.notOnDashboard", { count: availableDocker.length })}</span>
              </div>
              {dockerResults.map((svc) => {
                const imported = services.some((e) => Service.equals(svc, e));

                return (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between px-4 py-3 bg-background border border-border rounded-lg transition-colors hover:border-primary/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <StatusDot status={svc.status} /> {svc.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold uppercase bg-accent-purple/10 text-accent-purple">
                          {t("discovery.tagDocker")}
                        </span>
                        {svc.host}
                        {svc.ports?.map((p) => (
                          <PortTag key={p}>:{p}</PortTag>
                        ))}
                      </div>
                    </div>
                    {imported ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold uppercase bg-success/15 text-success">
                        <Icons.Check size={11} /> {t("discovery.onDashboard")}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
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
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-1 text-foreground flex items-center gap-2">
            <Icons.Globe size={18} /> {t("discovery.networkTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">{t("discovery.networkDesc")}</p>
          <div className="mb-4">
            <TagArrayInput
              values={cidrs}
              onChange={setCidrs}
              validate={validateCidr}
              placeholder={t("discovery.cidrPlaceholder")}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">
              {t("discovery.scanPortsLabel")}
            </label>
            <Input
              value={scanPorts}
              onChange={(e) => setScanPorts(e.target.value)}
              placeholder={t("discovery.portsPlaceholder")}
            />
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <Button variant="default" onClick={handleNetworkScan} disabled={scanningNetwork}>
              <Icons.Scan size={14} />
              {scanningNetwork ? t("discovery.scanning") : t("discovery.scanNetwork")}
            </Button>
            {availableNetwork.length > 0 && !scanningNetwork && (
              <Button variant="outline" onClick={handleImportAllNetwork}>
                {t("discovery.importAll", { count: availableNetwork.length })}
              </Button>
            )}
          </div>

          {networkResults.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground mb-1 flex justify-between">
                <span>{t("discovery.foundServices", { count: networkResults.length })}</span>
                <span>{t("discovery.notOnDashboard", { count: availableNetwork.length })}</span>
              </div>
              {networkResults.map((svc) => {
                const imported = services.some((e) => Service.equals(svc, e));

                return (
                  <div
                    key={svc.id}
                    className="flex items-center justify-between px-4 py-3 bg-background border border-border rounded-lg transition-colors hover:border-primary/50"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <StatusDot status={svc.status} /> {svc.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold uppercase bg-success/10 text-success">
                          {t("discovery.tagNetwork")}
                        </span>
                        {svc.host}
                        {svc.ports?.map((p) => (
                          <PortTag key={p}>:{p}</PortTag>
                        ))}
                      </div>
                    </div>
                    {imported ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold uppercase bg-success/15 text-success">
                        <Icons.Check size={11} /> {t("discovery.onDashboard")}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
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
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
