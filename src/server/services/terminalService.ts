import type Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";

import { sanitizeDockerError } from "../lib/errors.js";

const TERMINAL_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes of inactivity

interface TerminalSession {
  stream: NodeJS.ReadWriteStream;
  lastActivity: number;
  ownerSessionId: string;
}

class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweepExpired(), 60_000);
    this.sweepTimer.unref();
  }

  async openSession(
    userSessionId: string,
    container: Docker.Container,
    cols: number,
    rows: number,
  ): Promise<{ sessionId: string; stream: NodeJS.ReadWriteStream }> {
    try {
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: [
          "/bin/sh",
          "-c",
          "TERM=xterm-256color; export TERM; [ -x /bin/bash ] && exec bash || exec sh",
        ],
        Env: [`COLUMNS=${cols}`, `LINES=${rows}`],
      });

      const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
      const sessionId = uuidv4();

      this.sessions.set(sessionId, {
        stream,
        lastActivity: Date.now(),
        ownerSessionId: userSessionId,
      });

      return { sessionId, stream };
    } catch (err) {
      throw new Error(sanitizeDockerError(err));
    }
  }

  registerSession(
    userSessionId: string,
    stream: NodeJS.ReadWriteStream,
  ): { sessionId: string; stream: NodeJS.ReadWriteStream } {
    const sessionId = uuidv4();

    this.sessions.set(sessionId, {
      stream,
      lastActivity: Date.now(),
      ownerSessionId: userSessionId,
    });

    return { sessionId, stream };
  }

  // Returns the session only when the caller's express-session ID matches
  // what was recorded at open time, so a leaked sessionId UUID alone can't
  // be used to write input.
  getSession(userSessionId: string, sessionId: string): TerminalSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) return undefined;

    if (session.ownerSessionId !== userSessionId) return undefined;

    return session;
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) session.lastActivity = Date.now();
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      this.sessions.delete(sessionId);
      session.stream.end();
      (session.stream as NodeJS.ReadWriteStream & { destroy?: () => void }).destroy?.();
    }
  }

  shutdown(): void {
    clearInterval(this.sweepTimer);

    for (const sessionId of this.sessions.keys()) this.closeSession(sessionId);
  }

  private sweepExpired(): void {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > TERMINAL_SESSION_TTL_MS) {
        this.closeSession(id);
      }
    }
  }
}

export const terminalService = new TerminalService();
