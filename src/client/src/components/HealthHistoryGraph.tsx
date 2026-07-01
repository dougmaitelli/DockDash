import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { HealthBucket } from "@shared";
import { ServiceStatus } from "@shared";

import { cn } from "@/lib/utils";
import { serviceApi } from "@/services/api";

const BUCKETS = 80;
const MS_PER_DAY = 86_400_000;
const PERIODS = [1, 7, 30] as const;

type Period = (typeof PERIODS)[number];

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

export function MiniHealthBar({ serviceId }: { serviceId: string }) {
  const [buckets, setBuckets] = useState<HealthBucket[] | null>(null);

  useEffect(() => {
    serviceApi
      .getHealthHistory(serviceId, 7, 12)
      .then((res) => setBuckets(res.data))
      .catch(() => setBuckets([]));
  }, [serviceId]);

  if (!buckets) return null;

  return (
    <div className="flex gap-[1px] h-3.5 w-14 shrink-0">
      {buckets.map((display, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            background: display ? BUCKET_COLORS[display] : "var(--border-color)",
            opacity: display ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

interface HealthHistoryGraphProps {
  serviceId: string;
}

export function HealthHistoryGraph({ serviceId }: HealthHistoryGraphProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(7);
  const [buckets, setBuckets] = useState<HealthBucket[] | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const bucketTimesRef = useRef<Array<{ start: number; end: number }>>([]);

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
      .getHealthHistory(serviceId, period, BUCKETS)
      .then((res) => setBuckets(res.data))
      .catch(() => setBuckets([]));
  }, [serviceId, period]);

  const uptime = useMemo(() => {
    if (!buckets) return null;

    const filled = buckets.filter((b) => b !== null);

    if (filled.length === 0) return null;

    const up = filled.filter((b) => b === ServiceStatus.UP).length;

    return Math.round((up / filled.length) * 100);
  }, [buckets]);

  const handleMouseMove = (e: React.MouseEvent, bucketIndex: number) => {
    const { start, end } = bucketTimesRef.current[bucketIndex] ?? { start: 0, end: 0 };
    const display = buckets?.[bucketIndex] ?? null;
    const statusLabel =
      display === null
        ? t("modals.healthHistoryNoChecks")
        : display === ServiceStatus.UP
          ? t("modals.healthHistoryStatusUp")
          : display === ServiceStatus.DOWN
            ? t("modals.healthHistoryStatusDown")
            : display === "mixed"
              ? t("modals.healthHistoryStatusMixed")
              : t("modals.healthHistoryStatusUnknown");

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      timeLabel: `${formatBucketTime(start, period)} – ${formatBucketTime(end, period)}`,
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
        ) : buckets.every((b) => b === null) ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            {t("modals.healthHistoryNoData")}
          </div>
        ) : (
          <div className="flex gap-[1.5px] h-7 rounded-sm">
            {buckets.map((display, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm cursor-default transition-opacity duration-100 hover:opacity-100"
                style={{
                  background: display ? BUCKET_COLORS[display] : "var(--border-color)",
                  opacity: display ? 1 : 0.4,
                }}
                onMouseMove={(e) => handleMouseMove(e, i)}
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
