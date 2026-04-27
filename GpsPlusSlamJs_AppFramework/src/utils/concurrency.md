# concurrency.ts

## Purpose

Provides helpers for limiting the number of concurrent async operations. Used to prevent excessive memory consumption and I/O pressure when scanning many files in parallel (e.g., reading zip metadata during scenario discovery).

## Public API

### `mapWithConcurrencyLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]>`

Maps over an array with a concurrency cap on the async mapper function. Behaves like `Promise.all(items.map(fn))` but limits how many mapper invocations run simultaneously.

- **Input:** Array of items, concurrency limit (positive integer, `>= 1`), async mapper function
- **Output:** Array of results in the same order as input items
- **Errors:**
  - Throws `RangeError` if `limit < 1` (e.g., 0, negative values)
  - Re-throws the first error from any mapper invocation (fail-fast, matching `Promise.all` semantics)

## Invariants & Assumptions

- Results are always returned **in input order**, regardless of completion order.
- At most `limit` mapper invocations are active at any time.
- If `limit >= items.length`, behavior is identical to `Promise.all`.
- Worker pool pattern: `min(limit, items.length)` workers pull from a shared index counter.

## Examples

```typescript
import { mapWithConcurrencyLimit } from './concurrency';

// Read metadata from 50 zip files, max 4 at a time
const results = await mapWithConcurrencyLimit(zipFiles, 4, async (file) => {
  return await readMetadata(file);
});
```

## Tests

- Unit tests: `concurrency.test.ts` — 9 tests covering ordered results, empty input, limit > items, peak concurrency tracking, error propagation, sequential execution (limit=1), RangeError for limit=0, RangeError for negative limit, and descriptive error message content.
