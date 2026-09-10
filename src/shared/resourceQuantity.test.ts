import { describe, expect, it } from "vitest";

import { parseResourceQuantity } from "./resourceQuantity.js";

describe("parseResourceQuantity", () => {
  it.each([
    ["250m", 0.25],
    ["100000000n", 0.1],
    ["100000u", 0.1],
    ["2", 2],
    ["128Mi", 128 * 1024 ** 2],
    ["1Ti", 1024 ** 4],
    ["1.5Gi", 1.5 * 1024 ** 3],
    ["1e6", 1e6],
    ["1E6", 1e6],
    ["1k", 1000],
    ["400m", 0.4],
    ["0", 0],
  ])("parses %s", (input, expected) =>
    expect(parseResourceQuantity(input as string)).toBeCloseTo(expected as number),
  );
  it.each(["", "unknown", "12Zi", "-1", "NaN", "1e999"])("rejects %s", (value) => {
    expect(() => parseResourceQuantity(value)).toThrow("Invalid Kubernetes resource quantity");
  });
});
