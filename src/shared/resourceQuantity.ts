// Parse non-negative resource quantities into base units (cores or bytes).
// Supports Kubernetes decimal SI, binary SI, and decimal exponent notation.
export function parseResourceQuantity(value: string): number {
  const match = value.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([eE][+-]?\d+|[numkKMGTPE]|[KMGTPE]i)?$/,
  );
  const scales: Record<string, number> = {
    n: 1e-9,
    u: 1e-6,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };
  const suffix = match?.[2] ?? "";
  const result = match
    ? Number(match[1]) * (scales[suffix] ?? (suffix ? Number(`1${suffix}`) : 1))
    : NaN;

  if (!Number.isFinite(result) || result < 0)
    throw new Error(`Invalid Kubernetes resource quantity: ${value}`);

  return result;
}
