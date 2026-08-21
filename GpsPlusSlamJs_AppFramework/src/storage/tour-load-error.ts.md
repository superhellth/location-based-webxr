# tour-load-error.ts

## Purpose

The two error tiers for a remote-archive load. `TourLoadError` is fatal to
the whole `openRemoteTour` call — a discriminated `loadCause` lets the caller
branch on _why_ ("this link isn't usable" vs. "this file is broken").
`StructuralAssetError` is the softer, per-asset tier: a permanent failure on
one `getAssetUrl` call that degrades a single asset without aborting the
whole load.

## Public API

- **`TourLoadCause`** — `'unusable-link' | 'cors' | 'corrupt' | 'missing' | 'invalid-tour-json' | 'asset-missing-in-zip'`.
- **`class TourLoadError extends Error`** — `readonly loadCause: TourLoadCause`
  (named to avoid colliding with the standard `Error.cause`).
- **`class StructuralAssetError extends Error`** — a _permanent_ per-asset
  failure (unknown id, entry missing from the central directory, a decode
  error, or a 4xx on a range read). Retrying cannot fix these; any other
  rejection from an asset backing is treated as transient and retried
  (see `asset-provider.ts`).

## Invariants & assumptions

- Pure. No dependencies.
- `TourLoadError` is the tier that aborts `openRemoteTour` entirely;
  `StructuralAssetError` never propagates past a single `getAssetUrl`.

## Examples

```ts
import { TourLoadError } from 'gps-plus-slam-app-framework/storage';

try {
  await openRemoteTour(url, parseTour);
} catch (err) {
  if (err instanceof TourLoadError) {
    console.error(`tour unusable: ${err.loadCause}`);
  }
}
```

## Tests

- `tour-load-error.test.ts` — `TourLoadError` carries its typed cause and
  message.
