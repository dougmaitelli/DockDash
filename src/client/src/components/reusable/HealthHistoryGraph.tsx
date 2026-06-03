import { useState, useEffect } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import type { ServiceHealthHistoryItem } from "@shared";
import { ServiceStatus } from "@shared";
import { colors } from "../../styles/vars";
import { serviceApi } from "../../services/api";

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

// ─── Styled components ────────────────────────────────────────────────────────

const Section = styled.div`
  margin-bottom: 20px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const SectionLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${colors.textMuted};
`;

const SectionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const UptimePct = styled.span`
  font-size: 0.75rem;
  color: ${colors.textSecondary};
`;

const PeriodTabs = styled.div`
  display: flex;
  gap: 2px;
  background: ${colors.bgPrimary};
  border-radius: 5px;
  padding: 2px;
`;

const PeriodTab = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? colors.bgCard : "none")};
  border: none;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active }) => ($active ? colors.textPrimary : colors.textMuted)};
  cursor: pointer;

  &:hover {
    color: ${colors.textPrimary};
  }
`;

const BarContainer = styled.div`
  display: flex;
  gap: 1.5px;
  height: 28px;
  border-radius: 4px;
`;

const BUCKET_COLORS: Record<string, string> = {
  [ServiceStatus.UP]: colors.accentGreen,
  [ServiceStatus.DOWN]: colors.accentRed,
  [ServiceStatus.UNKNOWN]: colors.accentGray,
  mixed: colors.accentYellow,
};

const BucketBar = styled.div<{ $display: BucketDisplay }>`
  flex: 1;
  border-radius: 2px;
  background: ${({ $display }) => ($display ? BUCKET_COLORS[$display] : colors.border)};
  opacity: ${({ $display }) => ($display ? 1 : 0.4)};
  cursor: default;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;
  }
`;

const Tooltip = styled.div`
  position: fixed;
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 5px;
  padding: 5px 9px;
  font-size: 0.7rem;
  color: ${colors.textPrimary};
  white-space: nowrap;
  pointer-events: none;
  z-index: 300;
  box-shadow: 0 2px 8px ${colors.blackAlpha30};
`;

const Placeholder = styled.div`
  font-size: 0.75rem;
  color: ${colors.textMuted};
  text-align: center;
  padding: 8px 0;
`;

// ─── Component ────────────────────────────────────────────────────────────────

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
      <Section>
        <SectionHeader>
          <SectionLabel>{t("modals.healthHistory")}</SectionLabel>
          <SectionMeta>
            {uptime !== null && (
              <UptimePct>{t("modals.healthHistoryUptime", { pct: uptime })}</UptimePct>
            )}
            <PeriodTabs>
              {PERIODS.map((p) => (
                <PeriodTab key={p} $active={period === p} onClick={() => setPeriod(p)}>
                  {t(`modals.healthHistoryPeriod${p}d` as const)}
                </PeriodTab>
              ))}
            </PeriodTabs>
          </SectionMeta>
        </SectionHeader>

        {!buckets ? (
          <Placeholder>…</Placeholder>
        ) : history!.length === 0 ? (
          <Placeholder>{t("modals.healthHistoryNoData")}</Placeholder>
        ) : (
          <BarContainer>
            {buckets.map((bucket, i) => (
              <BucketBar
                key={i}
                $display={bucket.display}
                onMouseMove={(e) => handleMouseMove(e, bucket)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </BarContainer>
        )}
      </Section>

      {tooltip && (
        <Tooltip style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}>
          <div style={{ opacity: 0.7 }}>{tooltip.timeLabel}</div>
          <div>{tooltip.statusLabel}</div>
        </Tooltip>
      )}
    </>
  );
}
