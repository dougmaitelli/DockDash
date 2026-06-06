import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ServiceHealthHistoryItem } from "@shared";
import { ServiceStatus } from "@shared";
import { serviceApi } from "@/services/api";

const BUCKETS = 80;
const PERIODS = [1, 7, 30] as const;

type Period = (typeof PERIODS)[number];

type BucketDisplay = ServiceStatus | "mixed" | null;

interface Bucket {
  start: number;
  end: number;
  display: BucketDisplay;
}

function bucketHistory(history: ServiceHealthHistoryItem[], days: number): Bucket[] {
  const now = Date.now();
  const rangeMs = days * 86_400_000;
  const start = now - rangeMs;
  const bucketMs = rangeMs / BUCKETS;

  const seen = Array.from({ length: BUCKETS }, () => new Set<ServiceStatus>());

  for (const item of history) {
    const t = new Date(item.checked_at).getTime();
    const idx = Math.min(Math.floor((t - start) / bucketMs), BUCKETS - 1);

    if (idx >= 0) seen[idx].add(item.status as ServiceStatus);
  }

  return Array.from({ length: BUCKETS }, (_, i) => {
    const s = seen[i];
    let display: BucketDisplay = null;

    if (s.size > 0) {
      const hasUp = s.has(ServiceStatus.UP);
      const hasDown = s.has(ServiceStatus.DOWN);

      if (hasUp && hasDown) {
        display = "mixed";
      } else if (hasDown) {
        display = ServiceStatus.DOWN;
      } else if (s.has(ServiceStatus.UNKNOWN)) {
        display = ServiceStatus.UNKNOWN;
      } else {
        display = ServiceStatus.UP;
      }
    }

    return { start: start + i * bucketMs, end: start + (i + 1) * bucketMs, display };
  });
}

function calcUptime(buckets: Bucket[]): number | null {
  const filled = buckets.filter((b) => b.display !== null);

  if (filled.length === 0) return null;

  const up = filled.filter((b) => b.display === ServiceStatus.UP).length;

  return Math.round((up / filled.length) * 100);
}

function formatBucketTime(ts: number, days: number): string {
  const d = new Date(ts);

  if (days === 1) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BUCKET_COLORS: Record<string, string> = {
  [ServiceStatus.UP]: "var(--accent-green)",
  [ServiceStatus.DOWN]: "var(--accent-red)",
  [ServiceStatus.UNKNOWN]: "var(--accent-gray)",
  mixed: "var(--accent-yellow)",
};

interface TooltipState {
  x: number;
  y: number;
  timeLabel: string;
  statusLabel: string;
}

interface HealthHistoryGraphProps {
  serviceId: string;
}

export function HealthHistoryGraph({ serviceId }: HealthHistoryGraphProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(7);
  const [history, setHistory] = useState<ServiceHealthHistoryItem[] | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    setHistory(null);
    serviceApi
      .getHealthHistory(serviceId, period)
      .then((res) => setHistory(res.data))
      .catch(() => setHistory([]));
  }, [serviceId, period]);

  const buckets = history ? bucketHistory(history, period) : null;
  const uptime = buckets ? calcUptime(buckets) : null;

  const handleMouseMove = (e: React.MouseEvent, bucket: Bucket) => {
    const statusLabel =
      bucket.display === null
        ? t("modals.healthHistoryNoChecks")
        : bucket.display === ServiceStatus.UP
          ? t("modals.healthHistoryStatusUp")
          : bucket.display === ServiceStatus.DOWN
            ? t("modals.healthHistoryStatusDown")
            : bucket.display === "mixed"
              ? t("modals.healthHistoryStatusMixed")
              : t("modals.healthHistoryStatusUnknown");

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      timeLabel: `${formatBucketTime(bucket.start, period)} – ${formatBucketTime(bucket.end, period)}`,
      statusLabel,
    });
  };

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            {t("modals.healthHistory")}
          </span>
          <div className="flex items-center gap-2.5">
            {uptime !== null && (
              <span className="text-xs text-secondary-foreground">
                {t("modals.healthHistoryUptime", { pct: uptime })}
              </span>
            )}
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
                  {t(`modals.healthHistoryPeriod${p}d` as const)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!buckets ? (
          <div className="text-xs text-muted-foreground text-center py-2">…</div>
        ) : history!.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            {t("modals.healthHistoryNoData")}
          </div>
        ) : (
          <div className="flex gap-[1.5px] h-7 rounded-sm">
            {buckets.map((bucket, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm cursor-default transition-opacity duration-100 hover:opacity-100"
                style={{
                  background: bucket.display
                    ? BUCKET_COLORS[bucket.display]
                    : "var(--border-color)",
                  opacity: bucket.display ? 1 : 0.4,
                }}
                onMouseMove={(e) => handleMouseMove(e, bucket)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        )}
      </div>

      {tooltip && (
        <div
          className="fixed bg-card border border-border rounded-[5px] px-2.5 py-1.5 text-[0.7rem] text-foreground whitespace-nowrap pointer-events-none z-[300] shadow-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <div style={{ opacity: 0.7 }}>{tooltip.timeLabel}</div>
          <div>{tooltip.statusLabel}</div>
        </div>
      )}
    </>
  );
}
