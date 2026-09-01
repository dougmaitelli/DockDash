export const SERVICE_LABEL_MAX_LENGTH = 50;
export const SERVICE_LABEL_MAX_COUNT = 20;

export function normalizeServiceLabel(label: string): string {
  return label.trim().normalize("NFKC").toLowerCase();
}
