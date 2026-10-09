import {
  createSseWriter,
  MAX_STREAM_BUFFER_BYTES,
  STREAM_DRAIN_TIMEOUT_MS,
} from "@server/lib/sseWriter.js";
import type { Response } from "express";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

function setup() {
  const response = Object.assign(new EventEmitter(), {
    writableLength: 0,
    write: vi.fn(() => true),
    destroy: vi.fn(),
  });
  const source = new PassThrough();
  const pause = vi.spyOn(source, "pause");
  const resume = vi.spyOn(source, "resume");
  const close = vi.fn(() => source.destroy());
  const writer = createSseWriter(response as unknown as Response, source, close);

  return { response, source, pause, resume, close, writer };
}

describe("SSE backpressure", () => {
  afterEach(() => vi.useRealTimers());

  it("pauses blocked output and resumes only after drain", () => {
    const { response, pause, resume, close, writer } = setup();

    response.write.mockReturnValue(false);
    writer.write("data: output\n\n");
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    response.emit("drain");
    expect(resume).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    writer.dispose();
  });

  it("closes the producer and response when a client never drains", () => {
    vi.useFakeTimers();
    const { response, close, writer } = setup();

    response.write.mockReturnValue(false);
    writer.write("data: output\n\n");
    vi.advanceTimersByTime(STREAM_DRAIN_TIMEOUT_MS);
    expect(close).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.listenerCount("drain")).toBe(0);
  });

  it("cancels the timeout after a successful drain", () => {
    vi.useFakeTimers();
    const { response, close, writer } = setup();

    response.write.mockReturnValue(false);
    writer.write("data: output\n\n");
    response.emit("drain");
    vi.advanceTimersByTime(STREAM_DRAIN_TIMEOUT_MS);
    expect(close).not.toHaveBeenCalled();
    writer.dispose();
  });

  it("removes drain listeners and timers when disposed while blocked", () => {
    vi.useFakeTimers();
    const { response, resume, close, writer } = setup();

    response.write.mockReturnValue(false);
    writer.write("data: output\n\n");
    writer.dispose();
    response.emit("drain");
    vi.advanceTimersByTime(STREAM_DRAIN_TIMEOUT_MS);
    writer.write("late output");
    expect(response.write).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(response.listenerCount("drain")).toBe(0);
  });

  it("bounds buffered output even when a producer ignores pause", () => {
    const { response, close, writer } = setup();

    response.writableLength = MAX_STREAM_BUFFER_BYTES;
    writer.write("data: more\n\n");
    expect(response.write).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it("rejects a single oversized event before buffering it", () => {
    const { response, close, writer } = setup();

    writer.write("x".repeat(MAX_STREAM_BUFFER_BYTES + 1));
    expect(response.write).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
