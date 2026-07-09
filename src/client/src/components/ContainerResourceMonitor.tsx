import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ContainerStats } from "@shared";

import { cn } from "@/lib/utils";
import { serviceApi } from "@/services/api";

const POLL_INTERVAL_MS = 2500;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface StatBarProps {
  label: string;
  value: string;
  percent: number;
  color: string;
}

function StatBar({ label, value, percent, color }: StatBarProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-secondary-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-background overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percent, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

interface StatRowProps {
  items: { label: string; value: string }[];
}

function StatRow({ items }: StatRowProps) {
  return (
    <div className={cn("grid gap-2", items.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs font-mono text-secondary-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

interface ContainerResourceMonitorProps {
  serviceId: string;
}

export function ContainerResourceMonitor({ serviceId }: ContainerResourceMonitorProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetch = () => {
      serviceApi
        .getStats(serviceId)
        .then((res) => {
          if (!cancelled) {
            setStats(res.data);
            setError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    };

    fetch();
    intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;

      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [serviceId]);

  if (error) return null;

  const memPercent =
    stats && stats.memoryLimit > 0 ? (stats.memoryUsed / stats.memoryLimit) * 100 : 0;

  return (
    <div className="mb-5 flex flex-col gap-4">
      <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
        {t("modals.resourceMonitor")}
      </span>

      {!stats ? (
        <div className="text-xs text-muted-foreground text-center py-2">…</div>
      ) : (
        <>
          <Section title={t("modals.resourceCpu")}>
            <StatBar
              label={`${stats.cpuPercent.toFixed(1)}%`}
              value={`${stats.cpuPercent.toFixed(1)}%`}
              percent={stats.cpuPercent}
              color="var(--accent-blue)"
            />
          </Section>

          <Section title={t("modals.resourceMemory")}>
            <StatBar
              label={`${formatBytes(stats.memoryUsed)} / ${formatBytes(stats.memoryLimit)}`}
              value={`${memPercent.toFixed(1)}%`}
              percent={memPercent}
              color={
                memPercent >= 90
                  ? "var(--accent-red)"
                  : memPercent >= 75
                    ? "var(--accent-yellow)"
                    : "var(--accent-green)"
              }
            />
          </Section>

          <Section title={t("modals.resourceNetwork")}>
            <StatRow
              items={[
                { label: t("modals.resourceRx"), value: formatBytes(stats.networkRx) },
                { label: t("modals.resourceTx"), value: formatBytes(stats.networkTx) },
              ]}
            />
          </Section>

          <Section title={t("modals.resourceDisk")}>
            <StatRow
              items={[
                { label: t("modals.resourceRead"), value: formatBytes(stats.blockRead) },
                { label: t("modals.resourceWrite"), value: formatBytes(stats.blockWrite) },
              ]}
            />
          </Section>
        </>
      )}
    </div>
  );
}
