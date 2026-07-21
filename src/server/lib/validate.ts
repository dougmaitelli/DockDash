export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

export function isValidEnumValue<T extends object>(enumObj: T, v: unknown): v is T[keyof T] {
  return Object.values(enumObj).includes(v as T[keyof T]);
}

export function isValidContainerPath(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.includes("\0") && v.length <= 4096;
}

export function isValidPort(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 65535;
}

export function validateNetworkCidr(value: unknown): string | null {
  if (typeof value !== "string") return "CIDR must be a string";

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);

  if (!match) return "Invalid IPv4 CIDR";

  const octets = match.slice(1, 5);

  if (octets.some((octet) => Number(octet) > 255 || String(Number(octet)) !== octet)) {
    return "Invalid IPv4 CIDR";
  }

  const prefix = Number(match[5]);

  if (prefix > 32 || String(prefix) !== match[5]) return "Invalid IPv4 CIDR";

  return null;
}
