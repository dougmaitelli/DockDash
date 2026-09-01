import { describe, expect, it } from "vitest";

import { getServiceLabelColorStyle } from "../../lib/serviceLabelColors";

describe("service label colors", () => {
  it("keeps a label's color stable and case-insensitive", () => {
    const color = getServiceLabelColorStyle("Production");

    expect(getServiceLabelColorStyle("Production")).toEqual(color);
    expect(getServiceLabelColorStyle(" production ")).toEqual(color);
  });

  it("generates a distinct base color for representative labels", () => {
    const labels = [
      "Production",
      "Backend",
      "Database",
      "Monitoring",
      "Internal",
      "Public",
      "Edge",
      "Frontend",
      "Customer-facing",
      "Cache",
      "Metrics",
    ];
    const colors = new Set(
      labels.map((label) => getServiceLabelColorStyle(label)["--service-label-color"]),
    );
    const hues = [...colors]
      .map((color) => Number(color.match(/ ([0-9]+)\)$/)?.[1]))
      .sort((a, b) => a - b);
    const hueGaps = hues.map((hue, index) => {
      const nextHue = hues[index + 1] ?? hues[0] + 360;

      return nextHue - hue;
    });

    expect(colors.size).toBe(labels.length);
    expect(Math.min(...hueGaps)).toBeGreaterThanOrEqual(25);
  });
});
