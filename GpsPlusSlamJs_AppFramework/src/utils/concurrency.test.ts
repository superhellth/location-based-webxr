/**
 * Tests for concurrency utilities.
 *
 * Why these tests matter: The mapWithConcurrencyLimit utility controls how many
 * async operations run simultaneously. This is critical for memory-efficient
 * scanning of many large zip files (discoverScenariosFromZipMetadata) — without
 * a concurrency cap, Promise.all on 50 large zips would load all of them into
 * memory at once, potentially crashing the browser tab.
 */

import { describe, it, expect } from 'vitest';
import { mapWithConcurrencyLimit } from './concurrency';

describe('mapWithConcurrencyLimit', () => {
  it('maps all items and returns results in order', async () => {
    // Why: Basic contract — results must be in the same order as input items,
    // regardless of which tasks finish first.
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrencyLimit(items, 2, (x) =>
      Promise.resolve(x * 10)
    );

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('returns empty array for empty input', async () => {
    // Why: Edge case — no items means no work, no errors.
    const results = await mapWithConcurrencyLimit([], 3, (x: number) =>
      Promise.resolve(x)
    );
    expect(results).toEqual([]);
  });

  it('works when concurrency limit exceeds item count', async () => {
    // Why: Concurrency limit larger than the array should behave like Promise.all
    // (all items run at once).
    const items = [1, 2];
    const results = await mapWithConcurrencyLimit(items, 100, (x) =>
      Promise.resolve(x + 1)
    );
    expect(results).toEqual([2, 3]);
  });

  it('limits concurrent executions to the specified count', async () => {
    // Why: This is the core behavior — at no point should more than `limit`
    // tasks be running simultaneously.
    let activeTasks = 0;
    let peakConcurrency = 0;
    const concurrencyLimit = 2;

    const items = [1, 2, 3, 4, 5, 6];

    await mapWithConcurrencyLimit(items, concurrencyLimit, async (item) => {
      activeTasks++;
      peakConcurrency = Math.max(peakConcurrency, activeTasks);
      // Simulate async work with a small delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeTasks--;
      return item;
    });

    expect(peakConcurrency).toBeLessThanOrEqual(concurrencyLimit);
    // Also verify work actually ran concurrently (not sequentially one-by-one)
    expect(peakConcurrency).toBe(concurrencyLimit);
  });

  it('propagates errors from the mapper function', async () => {
    // Why: If one task fails, the entire operation should fail with that error.
    // This matches Promise.all semantics — fail fast.
    const items = [1, 2, 3];

    await expect(
      mapWithConcurrencyLimit(items, 2, (x) => {
        if (x === 2) {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve(x);
      })
    ).rejects.toThrow('boom');
  });

  it('handles concurrency limit of 1 (sequential execution)', async () => {
    // Why: Limit=1 means tasks run one at a time. This is the most restrictive
    // setting and should still produce correct, ordered results.
    const executionOrder: number[] = [];
    const items = [3, 1, 2];

    const results = await mapWithConcurrencyLimit(items, 1, async (x) => {
      executionOrder.push(x);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return x * 2;
    });

    expect(results).toEqual([6, 2, 4]);
    expect(executionOrder).toEqual([3, 1, 2]); // Sequential = input order
  });

  it('throws RangeError when limit is 0', async () => {
    // Why: limit=0 would cause zero workers to start, silently returning an
    // array of undefined values — violating the Promise.all contract. The
    // function must reject invalid limits early with a clear error.
    await expect(
      mapWithConcurrencyLimit([1, 2], 0, (x) => Promise.resolve(x))
    ).rejects.toThrow(RangeError);
  });

  it('throws RangeError when limit is negative', async () => {
    // Why: Negative limits are nonsensical and would also produce zero workers.
    // Guard against accidental misuse (e.g., off-by-one calculations).
    await expect(
      mapWithConcurrencyLimit([1, 2], -1, (x) => Promise.resolve(x))
    ).rejects.toThrow(RangeError);
  });

  it('includes the invalid value in the RangeError message', async () => {
    // Why: A descriptive error message helps callers quickly identify
    // the root cause without needing to step through the code.
    await expect(
      mapWithConcurrencyLimit([1], 0, (x) => Promise.resolve(x))
    ).rejects.toThrow('Concurrency limit must be >= 1, got 0');
  });
});
