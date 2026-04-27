# lerp-utils.ts

## Purpose

Shared linear-interpolation utilities for frame-rate-independent smoothing, used by `alignment-lerper.ts` and `camera-follower.ts`.

## Public API

```ts
export const DEFAULT_LERP_RATE: number; // 8

export function clampedAlpha(lerpRate: number, dt: number): number;
```

- `DEFAULT_LERP_RATE` — default smoothing rate (units: 1/second). Higher = faster convergence.
- `clampedAlpha(lerpRate, dt)` — returns `Math.min(lerpRate * dt, 1.0)`, the per-frame lerp alpha clamped to [0, 1].

## Invariants & assumptions

- `dt` is the frame delta in **seconds** (not milliseconds).
- Output is always in `[0, 1]`. At 60 fps (`dt ≈ 0.0167`), alpha ≈ 0.133.
- When `dt` is large (e.g., tab was backgrounded), alpha saturates at 1.0 (instant snap).

## Tests

- `lerp-utils.test.ts` — default value, typical frame, large-dt clamping, zero-dt edge case, custom rate
