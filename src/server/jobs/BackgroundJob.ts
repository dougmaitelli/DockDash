import { logger } from "../lib/logService.js";

export abstract class BackgroundJob {
  abstract readonly name: string;
  abstract readonly intervalMs: number;
  readonly runImmediately: boolean = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;

  abstract run(): Promise<void> | void;

  start(): void {
    if (!this.stopped) return;

    this.stopped = false;

    if (this.runImmediately) {
      void this.execute().finally(() => this.schedule());

      return;
    }

    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await this.running;
  }

  private schedule(): void {
    if (this.stopped) return;

    this.timer = setTimeout(async () => {
      this.timer = undefined;
      await this.execute();
      this.schedule();
    }, this.intervalMs);

    this.timer.unref();
  }

  private async execute(): Promise<void> {
    const execution = (async () => {
      try {
        await this.run();
      } catch (err) {
        logger.error(`[${this.name}] failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    this.running = execution;
    await execution;

    if (this.running === execution) this.running = undefined;
  }
}
