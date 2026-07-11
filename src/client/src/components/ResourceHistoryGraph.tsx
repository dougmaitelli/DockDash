import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ResourceBucket } from "@shared";

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

function memoryColor(pct: number): string {
  if (pct >= 90) return "var(--accent-red)";

  if (pct >= 75) return "var(--accent-yellow)";

  return "var(--accent-green)";
}

interface TooltipState {
  x: number;
  y: number;
  timeLabel: string;
  cpuPct: number;
  memPct: number;
}

interface ResourceHistoryGraphProps {
  serviceId: string;
}

export function ResourceHistoryGraph({ serviceId }: ResourceHistoryGraphProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(7);
  const [buckets, setBuckets] = useState<ResourceBucket[] | null>(null);
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
      .getResourceHistory(serviceId, period, BUCKETS)
      .then((res) => setBuckets(res.data))
      .catch(() => setBuckets([]));
  }, [serviceId, period]);

  const hasData = useMemo(() => buckets?.some((b) => b !== null) ?? false, [buckets]);

  const handleMouseMove = (e: React.MouseEvent, bucketIndex: number) => {
    const { start, end } = bucketTimesRef.current[bucketIndex] ?? { start: 0, end: 0 };
    const bucket = buckets?.[bucketIndex] ?? null;

    if (!bucket) return;

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      timeLabel: `${formatBucketTime(start, period)} – ${formatBucketTime(end, period)}`,
      cpuPct: bucket.cpuPercent,
      memPct: bucket.memoryPercent,
    });
  };

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
            {t("modals.resourceHistory")}
          </span>
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

        {!buckets ? (
          <div className="flex flex-col gap-1.5 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-8 rounded-sm bg-border" />
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            {t("modals.resourceHistoryNoData")}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-[1.5px] h-8 items-end rounded-sm">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 flex items-end cursor-default"
                  style={{ height: "100%" }}
                  onMouseMove={(e) => handleMouseMove(e, i)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div
                    className="w-full rounded-sm transition-all duration-500"
                    style={{
                      height: b ? `${Math.max(b.cpuPercent, 2)}%` : "2px",
                      background: b ? "var(--accent-blue)" : "var(--border-color)",
                      opacity: b ? 1 : 0.4,
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-[1.5px] h-8 items-end rounded-sm">
              {buckets.map((b, i) => (
                <div
                  key={i}
                  className="flex-1 flex items-end cursor-default"
                  style={{ height: "100%" }}
                  onMouseMove={(e) => handleMouseMove(e, i)}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div
                    className="w-full rounded-sm transition-all duration-500"
                    style={{
                      height: b ? `${Math.max(b.memoryPercent, 2)}%` : "2px",
                      background: b ? memoryColor(b.memoryPercent) : "var(--border-color)",
                      opacity: b ? 1 : 0.4,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {tooltip && (
        <div
          className="fixed bg-card border border-border rounded-[5px] px-2.5 py-1.5 text-[0.7rem] text-foreground whitespace-nowrap pointer-events-none z-[300] shadow-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 56 }}
        >
          <div style={{ opacity: 0.7 }}>{tooltip.timeLabel}</div>
          <div>{t("modals.resourceHistoryCpu", { pct: tooltip.cpuPct.toFixed(1) })}</div>
          <div>{t("modals.resourceHistoryMemory", { pct: tooltip.memPct.toFixed(1) })}</div>
        </div>
      )}
    </>
  );
}
