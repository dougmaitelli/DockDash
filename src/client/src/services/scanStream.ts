import type { ZodType } from "zod";

import type { Service } from "@shared";
import {
  serviceResponseSchema,
  SSE_EVENT,
  sseScanDoneResponseSchema,
  sseScanErrorResponseSchema,
} from "@shared";

interface ScanStreamOptions {
  url: string;
  onService: (service: Service) => void;
  onDone: (count: number) => Promise<void> | void;
  onError: (message: string) => void;
}

function parseEvent<T>(schema: ZodType<T>, data: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(data));

    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function startScanStream({
  url,
  onService,
  onDone,
  onError,
}: ScanStreamOptions): EventSource {
  const es = new EventSource(url);

  const invalidPayload = () => {
    es.close();
    onError("invalid response from server");
  };

  es.addEventListener("message", (e) => {
    const service = parseEvent(serviceResponseSchema, e.data);

    if (!service) return invalidPayload();

    onService(service);
  });

  es.addEventListener(SSE_EVENT.DONE, async (e) => {
    const payload = parseEvent(sseScanDoneResponseSchema, e.data);

    if (!payload) return invalidPayload();

    es.close();
    await onDone(payload.count);
  });

  es.addEventListener(SSE_EVENT.SCAN_ERROR, (e) => {
    const payload = parseEvent(sseScanErrorResponseSchema, e.data);

    if (!payload) return invalidPayload();

    es.close();
    onError(payload.message);
  });

  es.onerror = () => {
    es.close();
    onError("connection error");
  };

  return es;
}
