class ServerHealth {
  private ready = false;

  markReady(): void {
    this.ready = true;
  }

  markNotReady(): void {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }
}

export const serverHealth = new ServerHealth();
