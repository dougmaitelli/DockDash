import type { CSSProperties } from "react";

import { normalizeServiceLabel } from "@shared";

export type ServiceLabelColorStyle = CSSProperties & {
  "--service-label-color": string;
};

function hashLabel(label: string): number {
  let hash = 2166136261;

  for (const character of normalizeServiceLabel(label)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  // Avalanche the FNV result so hue, lightness, and chroma use well-mixed bits.
  hash ^= 0x000285d1;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

export function getServiceLabelColorStyle(label: string): ServiceLabelColorStyle {
  const hash = hashLabel(label);
  const hue = hash % 360;
  const lightness = 62 + ((hash >>> 9) % 17);
  const chroma = (0.15 + ((hash >>> 17) % 8) / 100).toFixed(2);
  const color = `oklch(${lightness}% ${chroma} ${hue})`;

  return {
    "--service-label-color": color,
    color: "color-mix(in oklch, var(--service-label-color) 75%, var(--foreground))",
    backgroundColor: "color-mix(in srgb, var(--service-label-color) 16%, transparent)",
    borderColor: "color-mix(in srgb, var(--service-label-color) 45%, transparent)",
  };
}
