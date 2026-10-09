import type { Response } from "express";

export const MAX_STREAM_BUFFER_BYTES = 1024 * 1024;

export const STREAM_DRAIN_TIMEOUT_MS = 30_000;

/** Pause the producer while HTTP output is blocked; close stalled or oversized streams. */
export function createSseWriter(
  res: Response,
  source: NodeJS.ReadableStream,
  closeSource: () => void,
): { write: (event: string) => void; dispose: () => void } {
  let disposed = false;
  let blocked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    disposed = true;

    if (timer) clearTimeout(timer);

    res.off("drain", drain);
  };
  const stop = () => {
    dispose();
    closeSource();
    res.destroy();
  };
  const drain = () => {
    if (disposed || !blocked) return;

    blocked = false;

    if (timer) clearTimeout(timer);

    timer = undefined;
    source.resume();
  };

  res.on("drain", drain);

  return {
    dispose,
    write(event) {
      if (disposed) return;

      if (res.writableLength + Buffer.byteLength(event) > MAX_STREAM_BUFFER_BYTES) {
        stop();

        return;
      }

      if (!res.write(event) && !blocked) {
        blocked = true;
        source.pause();
        timer = setTimeout(stop, STREAM_DRAIN_TIMEOUT_MS);
        timer.unref();
      }
    },
  };
}
