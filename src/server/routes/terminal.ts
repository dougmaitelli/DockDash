import { Router } from "express";

import { type TerminalInputRequest, terminalInputRequestSchema } from "@shared/requestSchemas.js";
import type { ApiSuccess, SseTerminalSessionPayload } from "@shared/responseSchemas.js";
import { SSE_EVENT } from "@shared/types.js";

import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";
import { createSseWriter, MAX_STREAM_BUFFER_BYTES } from "../lib/sseWriter.js";
import { validateBody } from "../middleware/validateRequest.js";
import { containerRuntimeService } from "../services/containerRuntime/containerRuntimeService.js";
import { terminalService } from "../services/terminalService.js";

const router = Router();

declare module "express-session" {
  interface SessionData {
    terminalInitialized?: boolean;
  }
}

router.get("/services/:id/terminal/stream", async (req, res) => {
  if (!config.terminalEnabled) {
    return res.status(403).json({ error: "Terminal is disabled" });
  }

  const cols = parseInt(req.query.cols as string, 10) || 80;
  const rows = parseInt(req.query.rows as string, 10) || 24;

  let closed = false;

  res.on("close", () => {
    closed = true;
  });

  try {
    const service = serviceRepository.requireService(req.params.id);

    // Initialize and persist ownership before SSE headers send the session cookie.
    if (!req.session.terminalInitialized) {
      req.session.terminalInitialized = true;
      await new Promise<void>((resolve, reject) => {
        req.session.save((error) => (error ? reject(error) : resolve()));
      });
    }

    if (closed) return;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const { sessionId, stream } = await containerRuntimeService
      .getRuntime(service)
      .openTerminal(req.sessionID, service, cols, rows, {
        maxBufferBytes: MAX_STREAM_BUFFER_BYTES,
      });

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

    const writer = createSseWriter(res, stream, safeClose);
    const sessionPayload: SseTerminalSessionPayload = { sessionId };

    writer.write(
      `event: ${SSE_EVENT.TERMINAL_SESSION}\ndata: ${JSON.stringify(sessionPayload)}\n\n`,
    );

    stream.on("data", (chunk: Buffer) => {
      if (!closed) {
        terminalService.touch(sessionId);
        writer.write(`data: ${JSON.stringify(chunk.toString("base64"))}\n\n`);
      }
    });

    stream.on("end", () => {
      writer.dispose();
      safeClose();

      if (!closed) {
        res.write(`event: ${SSE_EVENT.DONE}\ndata: {}\n\n`);
        res.end();
      }
    });

    stream.on("error", (err: Error) => {
      writer.dispose();
      safeClose();

      if (!closed) {
        res.write(
          `event: ${SSE_EVENT.TERMINAL_ERROR}\ndata: ${JSON.stringify({ message: err.message })}\n\n`,
        );
        res.end();
      }
    });

    stream.on("close", () => {
      writer.dispose();
      safeClose();

      if (!closed && !res.writableEnded) res.end();
    });

    res.on("close", () => {
      writer.dispose();
      safeClose();
    });
  } catch (err) {
    if (!closed) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Unable to initialize terminal session" });

        return;
      }

      res.write(
        `event: ${SSE_EVENT.TERMINAL_ERROR}\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`,
      );
      res.end();
    }
  }
});

router.post(
  "/services/:id/terminal/input",
  (_req, res, next) => {
    if (!config.terminalEnabled) {
      res.status(403).json({ error: "Terminal is disabled" });

      return;
    }

    next();
  },
  validateBody(terminalInputRequestSchema),
  (req, res) => {
    const { sessionId, data } = req.body as TerminalInputRequest;

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
  },
);

export default router;
