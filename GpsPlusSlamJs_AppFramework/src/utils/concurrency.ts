/**
 * Concurrency Utilities
 *
 * Provides helpers for limiting the number of concurrent async operations.
 * Used to prevent excessive memory consumption when scanning many files
 * in parallel (e.g., reading zip metadata during scenario discovery).
 */

/**
 * Map over an array with a concurrency limit on the async mapper function.
 *
 * Behaves like `Promise.all(items.map(fn))` but limits how many mapper
 * invocations run simultaneously. Results are returned in the same order
 * as the input items.
 *
 * @param items - Array of items to process
 * @param limit - Maximum number of concurrent mapper invocations
 * @param mapper - Async function to apply to each item
 * @returns Array of results in the same order as input items
 * @throws Re-throws the first error from any mapper invocation (fail-fast)
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit < 1) {
    throw new RangeError(`Concurrency limit must be >= 1, got ${limit}`);
  }

  const results: R[] = new Array<R>(items.length);

  if (items.length === 0) {
    return results;
  }

  // Use a pool of workers that pull from a shared index counter
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      // Safe: read + increment is synchronous (no yield between while-check and capture),
      // so no two workers can grab the same index.
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  };

  // Start `limit` workers (or fewer if items.length < limit)
  const workerCount = Math.min(limit, items.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
