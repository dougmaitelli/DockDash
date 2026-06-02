export abstract class BackgroundJob {
  abstract readonly name: string;
  abstract readonly intervalMs: number;
  readonly runImmediately: boolean = false;

  abstract run(): Promise<void> | void;

  start(): void {
    if (this.runImmediately) {
      this.execute();
    }

    this.schedule();
  }

  private schedule(): void {
    const timer = setTimeout(async () => {
      await this.execute();
      this.schedule();
    }, this.intervalMs);

    timer.unref();
  }

  private async execute(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      console.error(`[${this.name}] failed:`, err instanceof Error ? err.message : String(err));
    }
  }
}
