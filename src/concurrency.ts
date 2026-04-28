export type SettledConcurrencyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export function isSuccessfulConcurrencyResult<T>(
  result: SettledConcurrencyResult<T>,
): result is { ok: true; value: T } {
  return result.ok;
}

export async function runSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<SettledConcurrencyResult<R>[]> {
  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(concurrency)),
  );
  const results = new Array<SettledConcurrencyResult<R>>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          ok: true,
          value: await worker(items[index], index),
        };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker()),
  );

  return results;
}
