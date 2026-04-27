# persistence-middleware.performance.test.ts

## Purpose

Performance threshold guard for the persistence middleware's **synchronous dispatch overhead**. Runs on every `pnpm test` to catch regressions in the middleware's hot path.

## What it measures

The middleware executes synchronous logic on every Redux dispatch during recording:

1. Read `action.type` string
2. Capture `isRecording` state before reducer
3. Call `next(action)` (reducer runs)
4. Check action type prefix (`gpsData/`, `recorder/`)
5. Increment action index
6. Enqueue write function to `WriteQueue`

The async OPFS write is non-blocking and **not measured** — only the synchronous part matters for dispatch latency.

## Public API (test surface)

| Test                                       | Workload                                                       | Budget           |
| ------------------------------------------ | -------------------------------------------------------------- | ---------------- |
| `per-dispatch overhead during recording`   | 500 dispatches through fully-wired middleware (recording=true) | ≤ 0.1ms/dispatch |
| `per-dispatch overhead when NOT recording` | 500 dispatches (recording=false, early exit)                   | ≤ 0.1ms/dispatch |

## Invariants & assumptions

- `StorageBackend.writeAction` resolves instantly (`Promise.resolve`) — isolates middleware overhead from I/O.
- Redux `serializableCheck` and `immutableCheck` are disabled (matches production config).
- 0.1ms budget provides ~10× headroom over measured ~0.01ms to absorb CI variance.

## Test data

No external fixtures. Uses minimal inline Redux slices (`recorder` + `gpsData`) that mirror the structure in `persistence-middleware.test.ts`.

## Related files

- [persistence-middleware.ts](persistence-middleware.ts) — production implementation
- [persistence-middleware.test.ts](persistence-middleware.test.ts) — functional/unit tests (16 tests)
- [persistence-middleware.ts.md](persistence-middleware.ts.md) — component documentation
- [vitest-bench-integration-plan.md](../../../GpsPlusSlamJs/docs/vitest-bench-integration-plan.md) — step 8
