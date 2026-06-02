import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { SSE_EVENT } from "@shared";
import { colors } from "../../styles/vars";
import { SecondaryButton } from "../../utils/ui";

const MAX_LINES = 1000;

const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");

function parseLine(line: string): { ts: string; msg: string } {
  const spaceIdx = line.indexOf(" ");

  if (spaceIdx > 0 && line[spaceIdx - 1] === "Z") {
    const d = new Date(line.slice(0, spaceIdx));
    const ts = isNaN(d.getTime())
      ? line.slice(0, spaceIdx)
      : d.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

    return { ts, msg: stripAnsi(line.slice(spaceIdx + 1)) };
  }

  return { ts: "", msg: stripAnsi(line) };
}

// ─── Styled components ────────────────────────────────────────────────────────

type ConnStatus = "connecting" | "streaming" | "disconnected";

const Wrapper = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 16px;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 8px;
  flex-shrink: 0;
`;

const StatusLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const StatusDot = styled.span<{ $status: ConnStatus }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status }) =>
    $status === "streaming"
      ? colors.accentGreen
      : $status === "disconnected"
        ? colors.accentRed
        : colors.textMuted};
`;

const StatusText = styled.span`
  font-size: 0.7rem;
  color: ${colors.textMuted};
`;

const Terminal = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: ${colors.bgPrimary};
  border: 1px solid ${colors.border};
  border-radius: 6px;
  padding: 10px 12px;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 0.72rem;
  line-height: 1.6;
`;

const LogLine = styled.div`
  display: flex;
  gap: 10px;
  white-space: pre-wrap;
  word-break: break-all;
`;

const Timestamp = styled.span`
  flex-shrink: 0;
  color: ${colors.textMuted};
  opacity: 0.6;
  user-select: none;
`;

const Message = styled.span`
  color: ${colors.textSecondary};
`;

const EmptyState = styled.div`
  color: ${colors.textMuted};
  font-size: 0.75rem;
  padding: 8px 0;
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface DockerLogsProps {
  serviceId: string;
  reconnectTrigger?: number;
}

export function DockerLogs({ serviceId, reconnectTrigger }: DockerLogsProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectKey, setConnectKey] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    setLines([]);
    setStatus("connecting");
    setErrorMsg(null);

    const es = new EventSource(`/api/services/${serviceId}/logs/stream`);

    es.onopen = () => setStatus("streaming");

    es.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data as string];

        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };

    es.addEventListener(SSE_EVENT.LOG_ERROR, (e) => {
      const { message } = JSON.parse((e as MessageEvent).data) as { message: string };

      setErrorMsg(message);
      setStatus("disconnected");
      es.close();
    });

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
    };

    return () => es.close();
  }, [serviceId, connectKey, reconnectTrigger]);

  // Auto-scroll to bottom when new lines arrive, only if already at bottom
  useEffect(() => {
    if (isAtBottomRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const handleScroll = () => {
    const el = terminalRef.current;

    if (!el) return;

    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const statusLabel =
    status === "streaming"
      ? t("modals.logsLive")
      : status === "disconnected"
        ? t("modals.logsDisconnected")
        : t("modals.logsConnecting");

  return (
    <Wrapper>
      <StatusBar>
        <StatusLeft>
          <StatusDot $status={status} />
          <StatusText>{statusLabel}</StatusText>
          {errorMsg && <StatusText style={{ color: colors.accentRed }}>— {errorMsg}</StatusText>}
        </StatusLeft>
        {status === "disconnected" && (
          <SecondaryButton onClick={() => setConnectKey((k) => k + 1)}>
            {t("modals.logsReconnect")}
          </SecondaryButton>
        )}
      </StatusBar>

      <Terminal ref={terminalRef} onScroll={handleScroll}>
        {lines.length === 0 && status === "streaming" && (
          <EmptyState>{t("modals.logsNoOutput")}</EmptyState>
        )}
        {lines.map((line, i) => {
          const { ts, msg } = parseLine(line);

          return (
            <LogLine key={i}>
              {ts && <Timestamp>{ts}</Timestamp>}
              <Message>{msg}</Message>
            </LogLine>
          );
        })}
      </Terminal>
    </Wrapper>
  );
}
