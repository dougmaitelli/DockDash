import { Router } from "express";

import type { ApiSuccess, SseTerminalSessionPayload, TerminalInputRequest } from "@shared/api";
import { SSE_EVENT } from "@shared/api";

import { config } from "../lib/config.js";
import { dockerService } from "../services/dockerService.js";
import { terminalService } from "../services/terminalService.js";

const router = Router();

router.get("/services/:id/terminal/stream", async (req, res) => {
  if (!config.terminalEnabled) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const cols = parseInt(req.query.cols as string, 10) || 80;
  const rows = parseInt(req.query.rows as string, 10) || 24;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  try {
    const container = dockerService.getContainerForServiceId(req.params.id);
    const { sessionId, stream } = await terminalService.openSession(
      req.sessionID,
      container,
      cols,
      rows,
    );

    // Guard so closeSession is only ever called once regardless of which event fires first
    let sessionClosed = false;
    const safeClose = () => {
      if (!sessionClosed) {
        sessionClosed = true;
        terminalService.closeSession(sessionId);
      }
    };

    // Connection may have dropped while the terminal was opening asynchronously
    if (closed) {
      safeClose();

      return;
    }

    const sessionPayload: SseTerminalSessionPayload = { sessionId };

    res.write(`event: ${SSE_EVENT.TERMINAL_SESSION}\ndata: ${JSON.stringify(sessionPayload)}\n\n`);

    stream.on("data", (chunk: Buffer) => {
      if (!closed) {
        terminalService.touch(sessionId);
        res.write(`data: ${JSON.stringify(chunk.toString("base64"))}\n\n`);
      }
    });

    stream.on("end", () => {
      safeClose();

      if (!closed) {
        res.write(`event: ${SSE_EVENT.DONE}\ndata: {}\n\n`);
        res.end();
      }
    });

    stream.on("error", (err: Error) => {
      safeClose();

      if (!closed) {
        res.write(
          `event: ${SSE_EVENT.TERMINAL_ERROR}\ndata: ${JSON.stringify({ message: err.message })}\n\n`,
        );
        res.end();
      }
    });

    req.on("close", () => {
      safeClose();
    });
  } catch (err) {
    if (!closed) {
      res.write(
        `event: ${SSE_EVENT.TERMINAL_ERROR}\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`,
      );
      res.end();
    }
  }
});

router.post("/services/:id/terminal/input", (req, res) => {
  if (!config.terminalEnabled) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const { sessionId, data } = req.body as TerminalInputRequest;

  if (typeof sessionId !== "string" || typeof data !== "string") {
    return res.status(400).json({ error: "sessionId and data are required" });
  }

  const session = terminalService.getSession(req.sessionID, sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    terminalService.touch(sessionId);
    session.stream.write(data);
  } catch {
    return res.status(410).json({ error: "Session stream is closed" });
  }

  const response: ApiSuccess = { success: true };

  res.json(response);
});

export default router;
