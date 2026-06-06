import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SSE_EVENT } from "@shared";
import { Button } from "@/components/ui/Button";

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

type ConnStatus = "connecting" | "streaming" | "disconnected";

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

  const statusDotClass = cn(
    "w-[7px] h-[7px] rounded-full shrink-0",
    status === "streaming"
      ? "bg-success"
      : status === "disconnected"
        ? "bg-destructive"
        : "bg-muted-foreground",
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col pb-4">
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={statusDotClass} />
          <span className="text-[0.7rem] text-muted-foreground">{statusLabel}</span>
          {errorMsg && <span className="text-[0.7rem] text-destructive">— {errorMsg}</span>}
        </div>
        {status === "disconnected" && (
          <Button variant="outline" onClick={() => setConnectKey((k) => k + 1)}>
            {t("modals.logsReconnect")}
          </Button>
        )}
      </div>

      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-background border border-border rounded-md px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed"
      >
        {lines.length === 0 && status === "streaming" && (
          <div className="text-muted-foreground text-xs py-2">{t("modals.logsNoOutput")}</div>
        )}
        {lines.map((line, i) => {
          const { ts, msg } = parseLine(line);

          return (
            <div key={i} className="flex gap-2.5 whitespace-pre-wrap break-all">
              {ts && (
                <span className="shrink-0 text-muted-foreground opacity-60 select-none">{ts}</span>
              )}
              <span className="text-secondary-foreground">{msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
