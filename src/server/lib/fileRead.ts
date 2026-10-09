export interface FileReadOptions {
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export function fileReadError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** Include setup in the deadline; implementations must close late-arriving resources. */
export async function runFileRead<T>(
  options: FileReadOptions,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(fileReadError("File read cancelled", 499));
  const timer = setTimeout(
    () => controller.abort(fileReadError("File read timed out", 504)),
    options.timeoutMs,
  );
  const signal = controller.signal;
  let onAbort!: () => void;

  options.signal?.addEventListener("abort", cancel, { once: true });

  if (options.signal?.aborted) cancel();

  try {
    signal.throwIfAborted();

    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });

    return await Promise.race([read(signal), aborted]);
  } finally {
    clearTimeout(timer);

    if (onAbort) signal.removeEventListener("abort", onAbort);

    options.signal?.removeEventListener("abort", cancel);
  }
}
