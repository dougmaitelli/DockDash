import { useState } from "react";

import type { ResourceBucket } from "@shared";

function metricColor(pct: number, normalColor: string): string {
  if (pct >= 90) return "var(--accent-red)";

  if (pct >= 75) return "var(--accent-yellow)";

  return normalColor;
}

interface TooltipState {
  x: number;
  y: number;
  timeLabel: string;
  pct: number;
  color: string;
  label: string;
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

interface MiniChartProps {
  buckets: ResourceBucket[] | null;
  getValue: (b: NonNullable<ResourceBucket>) => number;
  normalColor: string;
  period: number;
  bucketTimesRef: React.MutableRefObject<Array<{ start: number; end: number }>>;
  metricLabel: string;
  onTooltip: (t: TooltipState | null) => void;
}

function MiniChart({
  buckets,
  getValue,
  normalColor,
  period,
  bucketTimesRef,
  metricLabel,
  onTooltip,
}: MiniChartProps) {
  if (!buckets) {
    return <div className="h-8 rounded-sm bg-border animate-pulse" />;
  }

  if (!buckets.some((b) => b !== null)) return null;

  return (
    <div className="flex gap-[1.5px] h-8 items-end rounded-sm">
      {buckets.map((b, i) => (
        <div
          key={i}
          className="flex-1 flex items-end cursor-default"
          style={{ height: "100%" }}
          onMouseMove={(e) => {
            if (!b) return;

            const pct = getValue(b);
            const { start, end } = bucketTimesRef.current[i] ?? { start: 0, end: 0 };

            onTooltip({
              x: e.clientX,
              y: e.clientY,
              timeLabel: `${formatBucketTime(start, period)} – ${formatBucketTime(end, period)}`,
              pct,
              color: metricColor(pct, normalColor),
              label: metricLabel,
            });
          }}
          onMouseLeave={() => onTooltip(null)}
        >
          <div
            className="w-full rounded-sm transition-all duration-500"
            style={{
              height: b ? `max(2px, ${Math.min(Math.max(getValue(b), 0), 100)}%)` : "2px",
              background: b ? metricColor(getValue(b), normalColor) : "var(--border-color)",
              opacity: b ? 1 : 0.4,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export interface ResourceMetricProps {
  title: string;
  buckets: ResourceBucket[] | null;
  getValue: (b: NonNullable<ResourceBucket>) => number;
  normalColor: string;
  period: number;
  bucketTimesRef: React.MutableRefObject<Array<{ start: number; end: number }>>;
  barLabel: string;
  barValue: string;
  barPercent: number;
}

export function ResourceMetric({
  title,
  buckets,
  getValue,
  normalColor,
  period,
  bucketTimesRef,
  barLabel,
  barValue,
  barPercent,
}: ResourceMetricProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted-foreground">
          {title}
        </span>
        <MiniChart
          buckets={buckets}
          getValue={getValue}
          normalColor={normalColor}
          period={period}
          bucketTimesRef={bucketTimesRef}
          metricLabel={title}
          onTooltip={setTooltip}
        />
        <StatBar
          label={barLabel}
          value={barValue}
          percent={barPercent}
          color={metricColor(barPercent, normalColor)}
        />
      </div>

      {tooltip && (
        <div
          className="fixed bg-card border border-border rounded-[5px] px-2.5 py-1.5 text-[0.7rem] text-foreground whitespace-nowrap pointer-events-none z-[300] shadow-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 56 }}
        >
          <div style={{ opacity: 0.7 }}>{tooltip.timeLabel}</div>
          <div style={{ color: tooltip.color }}>
            {tooltip.label}: {tooltip.pct.toFixed(1)}%
          </div>
        </div>
      )}
    </>
  );
}
