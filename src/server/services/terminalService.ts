import { v4 as uuidv4 } from "uuid";
import type Docker from "dockerode";

const TERMINAL_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes of inactivity

interface TerminalSession {
  stream: NodeJS.ReadWriteStream;
  lastActivity: number;
}

class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor() {
    setInterval(() => this.sweepExpired(), 60_000).unref();
  }

  async openSession(
    container: Docker.Container,
    cols: number,
    rows: number,
  ): Promise<{ sessionId: string; stream: NodeJS.ReadWriteStream }> {
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

    this.sessions.set(sessionId, { stream, lastActivity: Date.now() });

    return { sessionId, stream };
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) session.lastActivity = Date.now();
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.stream.end();
      this.sessions.delete(sessionId);
    }
  }

  private sweepExpired(): void {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > TERMINAL_SESSION_TTL_MS) {
        session.stream.end();
        this.sessions.delete(id);
      }
    }
  }
}

export const terminalService = new TerminalService();
