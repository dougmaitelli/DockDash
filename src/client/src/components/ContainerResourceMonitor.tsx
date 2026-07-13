import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ContainerStats, ResourceBucket } from "@shared";

import { cn } from "@/lib/utils";
import { serviceApi } from "@/services/api";

import { ResourceMetric } from "./ResourceMetric";

const POLL_INTERVAL_MS = 2500;
const BUCKETS = 80;
const MS_PER_DAY = 86_400_000;
const PERIODS = [1, 7, 30] as const;

type Period = (typeof PERIODS)[number];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface StatCellProps {
  label: string;
  value: string;
}

function StatCell({ label, value }: StatCellProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] text-muted-foreground">{label}</span>
      <span className="text-xs font-mono text-secondary-foreground">{value}</span>
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
  const [period, setPeriod] = useState<Period>(7);
  const [buckets, setBuckets] = useState<ResourceBucket[] | null>(null);
  const bucketTimesRef = useRef<Array<{ start: number; end: number }>>([]);

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

  useEffect(() => {
    setBuckets(null);

    const now = Date.now();
    const rangeMs = period * MS_PER_DAY;
    const bucketMs = rangeMs / BUCKETS;

    bucketTimesRef.current = Array.from({ length: BUCKETS }, (_, i) => ({
      start: now - rangeMs + i * bucketMs,
      end: now - rangeMs + (i + 1) * bucketMs,
    }));

    serviceApi
      .getResourceHistory(serviceId, period, BUCKETS)
      .then((res) => setBuckets(res.data))
      .catch(() => setBuckets([]));
  }, [serviceId, period]);

  if (error) return null;

  const periodSelector = (
    <div className="flex gap-0.5 bg-background rounded-[5px] p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={cn(
            "rounded-sm px-2 py-0.5 text-[0.7rem] hover:text-foreground",
            period === p
              ? "bg-card text-foreground font-semibold"
              : "bg-transparent text-muted-foreground font-normal",
          )}
        >
          {t(`drawer.healthHistory.period${p}d` as const)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            {t("drawer.resourceMonitor.title")}
          </span>
          {periodSelector}
        </div>

        {!stats ? (
          <div className="flex flex-col gap-3 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-2.5 w-10 rounded bg-border" />
                <div className="h-8 rounded-sm bg-border" />
                <div>
                  <div className="flex justify-between mb-1">
                    <div className="h-3 w-16 rounded bg-border" />
                    <div className="h-3 w-8 rounded bg-border" />
                  </div>
                  <div className="h-1.5 rounded-full bg-border" />
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="h-2.5 w-24 rounded bg-border" />
              <div className="grid grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="h-2 w-4 rounded bg-border" />
                    <div className="h-2.5 w-10 rounded bg-border" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <ResourceMetric
              title={t("drawer.resourceMonitor.cpu")}
              buckets={buckets}
              getValue={(b) => b.cpuPercent}
              normalColor="var(--accent-blue)"
              period={period}
              bucketTimesRef={bucketTimesRef}
              barLabel={`${stats.cpuPercent.toFixed(1)}%`}
              barValue={`${stats.cpuPercent.toFixed(1)}%`}
              barPercent={stats.cpuPercent}
            />

            <ResourceMetric
              title={t("drawer.resourceMonitor.memory")}
              buckets={buckets}
              getValue={(b) => b.memoryPercent}
              normalColor="var(--accent-green)"
              period={period}
              bucketTimesRef={bucketTimesRef}
              barLabel={`${formatBytes(stats.memoryUsed)} / ${formatBytes(stats.memoryLimit)}`}
              barValue={`${stats.memoryPercent.toFixed(1)}%`}
              barPercent={stats.memoryPercent}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
                {`${t("drawer.resourceMonitor.network")} / ${t("drawer.resourceMonitor.disk")}`}
              </span>
              <div className="grid grid-cols-4 gap-2">
                <StatCell
                  label={t("drawer.resourceMonitor.rx")}
                  value={formatBytes(stats.networkRx)}
                />
                <StatCell
                  label={t("drawer.resourceMonitor.tx")}
                  value={formatBytes(stats.networkTx)}
                />
                <StatCell
                  label={t("drawer.resourceMonitor.read")}
                  value={formatBytes(stats.blockRead)}
                />
                <StatCell
                  label={t("drawer.resourceMonitor.write")}
                  value={formatBytes(stats.blockWrite)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
