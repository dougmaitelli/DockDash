import type { Service } from "@shared";
import { SSE_EVENT } from "@shared";

interface ScanStreamOptions {
  url: string;
  onService: (service: Service) => void;
  onDone: (count: number) => Promise<void> | void;
  onError: (message: string) => void;
}

export function startScanStream({
  url,
  onService,
  onDone,
  onError,
}: ScanStreamOptions): EventSource {
  const es = new EventSource(url);

  es.addEventListener("message", (e) => {
    onService(JSON.parse(e.data) as Service);
  });

  es.addEventListener(SSE_EVENT.DONE, async (e) => {
    const { count } = JSON.parse(e.data) as { count: number };

    es.close();
    await onDone(count);
  });

  es.addEventListener(SSE_EVENT.SCAN_ERROR, (e) => {
    const { message } = JSON.parse(e.data) as { message: string };

    es.close();
    onError(message);
  });

  es.onerror = () => {
    es.close();
    onError("connection error");
  };

  return es;
}
