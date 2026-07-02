import { TagParser } from "@server/lib/tagParser.js";
import { describe, expect, it } from "vitest";

describe("TagParser.extractSemVer", () => {
  it("parses a plain version", () => {
    expect(TagParser.extractSemVer("1.2.3")).toEqual({
      version: "1.2.3",
      prefix: "",
      suffix: "",
      parts: [1, 2, 3],
    });
  });

  it("parses a v-prefixed version", () => {
    expect(TagParser.extractSemVer("v1.2.3")).toEqual({
      version: "1.2.3",
      prefix: "v",
      suffix: "",
      parts: [1, 2, 3],
    });
  });

  it("parses a version with suffix", () => {
    expect(TagParser.extractSemVer("0.8.10-slim")).toEqual({
      version: "0.8.10",
      prefix: "",
      suffix: "-slim",
      parts: [0, 8, 10],
    });
  });

  it("parses a v-prefixed version with suffix", () => {
    expect(TagParser.extractSemVer("v0.10.2-slim")).toEqual({
      version: "0.10.2",
      prefix: "v",
      suffix: "-slim",
      parts: [0, 10, 2],
    });
  });

  it("parses a version with non-v prefix", () => {
    expect(TagParser.extractSemVer("cuda-1.2.3")).toEqual({
      version: "1.2.3",
      prefix: "cuda-",
      suffix: "",
      parts: [1, 2, 3],
    });
  });

  it("parses a version with both non-v prefix and suffix", () => {
    expect(TagParser.extractSemVer("0.17.1-rocm")).toEqual({
      version: "0.17.1",
      prefix: "",
      suffix: "-rocm",
      parts: [0, 17, 1],
    });
  });

  it("parses a four-part version", () => {
    expect(TagParser.extractSemVer("1.2.3.4")).toEqual({
      version: "1.2.3.4",
      prefix: "",
      suffix: "",
      parts: [1, 2, 3, 4],
    });
  });

  it("returns null for non-semver tags", () => {
    expect(TagParser.extractSemVer("latest")).toBeNull();
    expect(TagParser.extractSemVer("main")).toBeNull();
    expect(TagParser.extractSemVer("stable")).toBeNull();
  });
});

describe("TagParser.prefixMatches", () => {
  it('treats "" and "v" as equal', () => {
    expect(TagParser.prefixMatches("", "v")).toBe(true);
    expect(TagParser.prefixMatches("v", "")).toBe(true);
  });

  it("matches identical prefixes", () => {
    expect(TagParser.prefixMatches("", "")).toBe(true);
    expect(TagParser.prefixMatches("v", "v")).toBe(true);
    expect(TagParser.prefixMatches("cuda-", "cuda-")).toBe(true);
  });

  it("does not match unrelated prefixes", () => {
    expect(TagParser.prefixMatches("cuda-", "")).toBe(false);
    expect(TagParser.prefixMatches("cuda-", "v")).toBe(false);
    expect(TagParser.prefixMatches("", "cuda-")).toBe(false);
  });
});

describe("TagParser.compareSemVer", () => {
  it("returns positive when a > b", () => {
    expect(TagParser.compareSemVer("1.2.4", "1.2.3")).toBeGreaterThan(0);
    expect(TagParser.compareSemVer("1.3.0", "1.2.9")).toBeGreaterThan(0);
    expect(TagParser.compareSemVer("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });

  it("returns zero when a === b", () => {
    expect(TagParser.compareSemVer("1.2.3", "1.2.3")).toBe(0);
    expect(TagParser.compareSemVer("0.0.0", "0.0.0")).toBe(0);
  });

  it("treats missing parts as zero", () => {
    expect(TagParser.compareSemVer("1.2", "1.2.0")).toBe(0);
    expect(TagParser.compareSemVer("1.2.0", "1.2")).toBe(0);
  });

  it("detects update from 1.2 to 1.2.5", () => {
    expect(TagParser.compareSemVer("1.2", "1.2.5")).toBeLessThan(0);
  });

  it("returns negative when a < b", () => {
    expect(TagParser.compareSemVer("1.2.3", "1.2.4")).toBeLessThan(0);
    expect(TagParser.compareSemVer("0.8.10", "0.10.2")).toBeLessThan(0);
  });

  it("correctly identifies non-v < v", () => {
    expect(TagParser.compareSemVer("0.8.10-slim", "v0.10.2-slim")).toBeLessThan(0);
  });

  it("compares versions with a shared non-v prefix", () => {
    expect(TagParser.compareSemVer("cuda-1.2.3", "cuda-1.2.4")).toBeLessThan(0);
  });

  it("compares versions with a shared -rocm suffix", () => {
    expect(TagParser.compareSemVer("0.17.1-rocm", "0.18.0-rocm")).toBeLessThan(0);
  });

  it("compares v-prefix tags across major bump", () => {
    expect(TagParser.compareSemVer("v1.5.0", "v2.0.0")).toBeLessThan(0);
  });

  it("compares four-part versions", () => {
    expect(TagParser.compareSemVer("1.2.3.4", "1.2.3.5")).toBeLessThan(0);
  });
});
