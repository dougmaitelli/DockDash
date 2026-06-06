import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { cn } from "@/lib/utils";
import { SSE_EVENT } from "@shared";
import { serviceApi } from "@/services/api";
import "@xterm/xterm/css/xterm.css";

type ConnStatus = "connecting" | "connected" | "disconnected";

interface TerminalProps {
  serviceId: string;
}

export function Terminal({ serviceId }: TerminalProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connectKey, setConnectKey] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "monospace",
      theme: {
        background: "transparent",
      },
    });

    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const cols = term.cols;
    const rows = term.rows;

    setStatus("connecting");
    setErrorMsg(null);
    sessionIdRef.current = null;

    const es = new EventSource(
      `/api/services/${serviceId}/terminal/stream?cols=${cols}&rows=${rows}`,
    );

    es.addEventListener(SSE_EVENT.TERMINAL_SESSION, (e) => {
      const { sessionId } = JSON.parse((e as MessageEvent).data) as { sessionId: string };

      sessionIdRef.current = sessionId;
      setStatus("connected");
    });

    es.onmessage = (e) => {
      const b64 = JSON.parse((e as MessageEvent).data) as string;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      term.write(bytes);
    };

    es.addEventListener(SSE_EVENT.DONE, () => {
      setStatus("disconnected");
      es.close();
    });

    es.addEventListener(SSE_EVENT.TERMINAL_ERROR, (e) => {
      const { message } = JSON.parse((e as MessageEvent).data) as { message: string };

      setErrorMsg(message);
      setStatus("disconnected");
      es.close();
    });

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
    };

    const onData = term.onData((data) => {
      const sid = sessionIdRef.current;

      if (!sid) return;

      serviceApi.writeTerminalInput(serviceId, { sessionId: sid, data }).catch(() => {});
    });

    return () => {
      es.close();
      onData.dispose();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [serviceId, connectKey]);

  const statusLabel =
    status === "connected"
      ? t("modals.terminalConnected")
      : status === "disconnected"
        ? t("modals.terminalDisconnected")
        : t("modals.terminalConnecting");

  const statusDotClass = cn(
    "w-[7px] h-[7px] rounded-full shrink-0",
    status === "connected"
      ? "bg-success"
      : status === "disconnected"
        ? "bg-destructive"
        : "bg-muted-foreground",
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col pt-4 px-5 pb-4">
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={statusDotClass} />
          <span className="text-[0.7rem] text-muted-foreground">{statusLabel}</span>
          {errorMsg && <span className="text-[0.7rem] text-destructive">— {errorMsg}</span>}
        </div>
        {status === "disconnected" && (
          <button
            type="button"
            onClick={() => setConnectKey((k) => k + 1)}
            className="text-[0.7rem] text-muted-foreground border border-border rounded px-2 py-0.5 bg-transparent hover:text-foreground"
          >
            {t("modals.terminalReconnect")}
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden bg-background border border-border rounded-md px-3 py-2.5"
      />
    </div>
  );
}
