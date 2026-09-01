import { describe, expect, it } from "vitest";

import { getServiceLabelColorClass } from "../../lib/serviceLabelColors";

describe("service label colors", () => {
  it("keeps a label's color stable and case-insensitive", () => {
    const color = getServiceLabelColorClass("Production");

    expect(getServiceLabelColorClass("Production")).toBe(color);
    expect(getServiceLabelColorClass(" production ")).toBe(color);
  });

  it("distributes label names across the color palette", () => {
    const colors = new Set(
      ["Production", "Backend", "Database", "Monitoring", "Internal", "Public"].map(
        getServiceLabelColorClass,
      ),
    );

    expect(colors.size).toBeGreaterThan(1);
  });
});
