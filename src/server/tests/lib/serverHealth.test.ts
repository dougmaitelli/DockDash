import { serverHealth } from "@server/lib/serverHealth.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("serverHealth", () => {
  beforeEach(() => serverHealth.markNotReady());

  it("starts and remains not ready until explicitly marked ready", () => {
    expect(serverHealth.isReady()).toBe(false);

    serverHealth.markReady();
    expect(serverHealth.isReady()).toBe(true);
  });

  it("transitions back to not ready during shutdown", () => {
    serverHealth.markReady();
    serverHealth.markNotReady();

    expect(serverHealth.isReady()).toBe(false);
  });
});
