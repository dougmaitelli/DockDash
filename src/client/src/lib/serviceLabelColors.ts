import { normalizeServiceLabel } from "@shared";

const SERVICE_LABEL_COLOR_CLASSES = [
  "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  "border-accent-green/30 bg-accent-green/15 text-accent-green",
  "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
  "border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow",
  "border-accent-red/30 bg-accent-red/15 text-accent-red",
  "border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan",
] as const;

export function getServiceLabelColorClass(label: string): string {
  let hash = 2166136261;

  for (const character of normalizeServiceLabel(label)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return SERVICE_LABEL_COLOR_CLASSES[(hash >>> 0) % SERVICE_LABEL_COLOR_CLASSES.length];
}
