# asset-provider.ts

## Purpose

`RefCountedAssetProvider` — a generic ref-counted, reject-on-error asset
provider. Given an async `loadAssetBlob(id)` backing and a URL minter, it
owns only tier-1 memory (the Blob/Blob URL) and two guarantees: ref-counting
(balanced `getAssetUrl`/`release`, one revoke at ref-count 0) and
reject-on-error with a retry policy that distinguishes transient failures
from permanent ones. It knows nothing about zips, ranges, or any specific
manifest format — `open-remote-tour.ts` supplies the zip-aware backing; any
other backing (a plain-files provider, a static test provider) can reuse it.

## Public API

- **`AssetId`** — `type AssetId = string`.
- **`AssetProvider`** — `{ getAssetUrl(id: AssetId): Promise<string>; release(id: AssetId): void }`.
  `getAssetUrl` is ref-counted: each call must be balanced by exactly one
  `release()`. The underlying Blob URL is revoked only when the ref-count for
  `id` reaches 0.
- **`RefCountedAssetProviderDeps`** — `{ loadAssetBlob, createObjectUrl?, revokeObjectUrl?, maxRetries?, delay? }`.
  `loadAssetBlob` throws a `StructuralAssetError` (see `tour-load-error.ts`)
  for permanent failures; any other rejection is transient and retried
  (default 2 extra attempts, exponential backoff from 2s).
- **`class RefCountedAssetProvider implements AssetProvider`**.

## Invariants & assumptions

- A `StructuralAssetError` from `loadAssetBlob` is thrown immediately, never
  retried. Any other rejection retries up to `maxRetries` times with
  exponential backoff (`delay` is injectable so tests don't wait for real).
- A failed load evicts itself from the ref-map, so a later request (e.g.
  re-entering a zone) starts a fresh attempt instead of replaying the cached
  rejection.
- Concurrent/repeat `getAssetUrl(id)` calls while a load is in flight share
  the same in-flight promise — an id is only ever loaded once per active
  reference.
- Defaults: `createObjectUrl`/`revokeObjectUrl` to the global `URL.*`
  (absent in Node — inject in tests).

## Examples

```ts
import { RefCountedAssetProvider } from 'gps-plus-slam-app-framework/storage';

const provider = new RefCountedAssetProvider({
  loadAssetBlob: (id) => fetchAssetBlob(id),
});
const url = await provider.getAssetUrl('asset-1');
// ...use url...
provider.release('asset-1');
```

## Tests

- `asset-provider.test.ts` — ref-counting balance, shared in-flight loads,
  retry-on-transient vs. throw-on-`StructuralAssetError`, backoff timing, and
  revoke-on-zero-refs including the still-loading-at-release race.
