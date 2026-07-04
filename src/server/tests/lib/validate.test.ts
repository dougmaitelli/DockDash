import {
  isNonEmptyString,
  isValidContainerPath,
  isValidEnumValue,
  isValidPort,
} from "@server/lib/validate.js";
import { describe, expect, it } from "vitest";

describe("isNonEmptyString", () => {
  it("returns true for a regular string", () => {
    expect(isNonEmptyString("hello")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isNonEmptyString("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isNonEmptyString("   ")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
  });
});

describe("isValidEnumValue", () => {
  enum Color {
    RED = "red",
    BLUE = "blue",
  }

  it("returns true for a valid enum value", () => {
    expect(isValidEnumValue(Color, "red")).toBe(true);
    expect(isValidEnumValue(Color, "blue")).toBe(true);
  });

  it("returns false for a value not in the enum", () => {
    expect(isValidEnumValue(Color, "green")).toBe(false);
  });

  it("returns false for non-string types", () => {
    expect(isValidEnumValue(Color, 42)).toBe(false);
    expect(isValidEnumValue(Color, null)).toBe(false);
  });
});

describe("isValidContainerPath", () => {
  it("returns true for a valid absolute path", () => {
    expect(isValidContainerPath("/etc/nginx/nginx.conf")).toBe(true);
    expect(isValidContainerPath("/")).toBe(true);
  });

  it("returns false for a relative path", () => {
    expect(isValidContainerPath("etc/nginx")).toBe(false);
    expect(isValidContainerPath("./relative")).toBe(false);
  });

  it("returns false for a path containing a null byte", () => {
    expect(isValidContainerPath("/etc/\0bad")).toBe(false);
  });

  it("returns false for a path over 4096 characters", () => {
    expect(isValidContainerPath("/" + "a".repeat(4096))).toBe(false);
  });

  it("returns true for a path exactly 4096 characters long", () => {
    expect(isValidContainerPath("/" + "a".repeat(4095))).toBe(true);
  });

  it("returns false for non-string values", () => {
    expect(isValidContainerPath(null)).toBe(false);
    expect(isValidContainerPath(42)).toBe(false);
  });
});

describe("isValidPort", () => {
  it("returns true for common ports", () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(443)).toBe(true);
    expect(isValidPort(3000)).toBe(true);
  });

  it("returns true for the boundary values (1 and 65535)", () => {
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });

  it("returns false for 0 (reserved / below range)", () => {
    expect(isValidPort(0)).toBe(false);
  });

  it("returns false for 65536 (above range)", () => {
    expect(isValidPort(65536)).toBe(false);
  });

  it("returns false for a float", () => {
    expect(isValidPort(80.5)).toBe(false);
  });

  it("returns false for non-number values", () => {
    expect(isValidPort("80")).toBe(false);
    expect(isValidPort(null)).toBe(false);
    expect(isValidPort(undefined)).toBe(false);
  });
});
