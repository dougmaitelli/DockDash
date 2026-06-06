export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

export function isValidEnumValue<T extends object>(enumObj: T, v: unknown): v is T[keyof T] {
  return Object.values(enumObj).includes(v as T[keyof T]);
}

export function isValidContainerPath(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.includes("\0") && v.length <= 4096;
}
