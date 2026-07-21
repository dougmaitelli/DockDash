export abstract class ConcurrentService {
  protected abstract readonly concurrencyLimit: number;

  protected async mapWithConcurrency<T, R>(
    items: readonly T[],
    worker: (item: T, index: number) => Promise<R>,
    limit = this.concurrencyLimit,
  ): Promise<R[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("Concurrency limit must be a positive integer");
    }

    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;

        results[index] = await worker(items[index], index);
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));

    return results;
  }
}
