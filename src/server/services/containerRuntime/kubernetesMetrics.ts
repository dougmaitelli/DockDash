import { z } from "zod";

// Sum per-device counters for the exact container, excluding pod aggregates and sidecars.
export function diskCounters(text: string, namespace: string, pod: string, container: string) {
  let blockRead: number | null = null;
  let blockWrite: number | null = null;

  for (const line of text.split("\n")) {
    const sample = line.match(
      /^(container_fs_(?:reads|writes)_bytes_total)\{(.*)\}\s+(\S+)(?:\s+\S+)?$/,
    );

    if (!sample) continue;

    const labels: Record<string, string> = {};

    for (const label of sample[2].matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) {
      labels[label[1]] = label[2].replace(/\\(\\|"|n)/g, (_, escaped: string) =>
        escaped === "n" ? "\n" : escaped,
      );
    }

    const value = Number(sample[3]);

    if (
      labels.namespace !== namespace ||
      labels.pod !== pod ||
      labels.container !== container ||
      !Number.isFinite(value) ||
      value < 0
    )
      continue;

    if (sample[1] === "container_fs_reads_bytes_total") blockRead = (blockRead ?? 0) + value;
    else blockWrite = (blockWrite ?? 0) + value;
  }

  return { blockRead, blockWrite };
}

const networkSchema = z.object({
  rxBytes: z.number().finite().nonnegative().optional(),
  txBytes: z.number().finite().nonnegative().optional(),
});
const summarySchema = z.object({
  pods: z.array(
    z.object({
      podRef: z.object({ uid: z.string(), name: z.string(), namespace: z.string() }),
      network: networkSchema.extend({ interfaces: z.array(networkSchema).optional() }).optional(),
    }),
  ),
});

export function networkCounters(
  summary: unknown,
  uid: string | undefined,
  namespace: string,
  name: string,
) {
  const parsed = summarySchema.safeParse(summary);
  const network = parsed.success
    ? parsed.data.pods.find(
        (pod) =>
          pod.podRef.uid === uid && pod.podRef.namespace === namespace && pod.podRef.name === name,
      )?.network
    : undefined;
  // The top-level counters repeat the default interface. Never add them twice.
  const interfaces = network?.interfaces?.length ? network.interfaces : network ? [network] : [];
  const total = (key: "rxBytes" | "txBytes") =>
    interfaces.length && interfaces.every((item) => item[key] !== undefined)
      ? interfaces.reduce((sum, item) => sum + item[key]!, 0)
      : null;

  return { networkRx: total("rxBytes"), networkTx: total("txBytes") };
}
