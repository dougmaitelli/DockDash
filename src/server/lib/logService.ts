const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type LogLevel = keyof typeof LEVELS;

class LogService {
  private readonly level: number;

  constructor() {
    const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();

    this.level = LEVELS[raw as LogLevel] ?? LEVELS.info;
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level >= LEVELS.error) console.error(this.tag("ERROR"), message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level >= LEVELS.warn) console.warn(this.tag("WARN "), message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level >= LEVELS.info) console.log(this.tag("INFO "), message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level >= LEVELS.debug) console.log(this.tag("DEBUG"), message, ...args);
  }

  private tag(level: string): string {
    return `[${new Date().toISOString()}] ${level}`;
  }
}

export const logger = new LogService();
