import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("LogService", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.LOG_LEVEL;
  });

  async function makeLogger(level?: string) {
    delete process.env.LOG_LEVEL;

    if (level !== undefined) process.env.LOG_LEVEL = level;

    vi.resetModules();

    return (await import("@server/lib/logService.js")).logger;
  }

  it("defaults to info level — suppresses debug", async () => {
    const logger = await makeLogger();

    logger.debug("debug msg");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("info level passes error, warn, and info but not debug", async () => {
    const logger = await makeLogger("info");

    logger.error("e");
    logger.warn("w");
    logger.info("i");
    logger.debug("d");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("debug level passes all messages", async () => {
    const logger = await makeLogger("debug");

    logger.error("e");
    logger.warn("w");
    logger.info("i");
    logger.debug("d");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it("warn level suppresses info and debug", async () => {
    const logger = await makeLogger("warn");

    logger.error("e");
    logger.warn("w");
    logger.info("i");
    logger.debug("d");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("error level passes only error", async () => {
    const logger = await makeLogger("error");

    logger.error("e");
    logger.warn("w");
    logger.info("i");
    logger.debug("d");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("invalid level falls back to info", async () => {
    const logger = await makeLogger("INVALID_LEVEL");

    logger.info("i");
    logger.debug("d");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive", async () => {
    const logger = await makeLogger("DEBUG");

    logger.debug("d");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
