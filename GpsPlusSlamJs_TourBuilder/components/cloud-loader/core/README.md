# cloud-loader / core

Pure, framework-free policy for the cloud-storage tour source (Component 6). No
DOM, no network, no zip.js — every branch is unit-testable in Node against fakes.
The I/O transport that drives these lives in `../view/`.

## Purpose

The four pieces the §2.5.4 loading policy reduces to once the I/O is stripped out:

- **`byte-source.ts`** — `ByteSource` (random-access `read(offset, length)`) and
  `SwitchableByteSource`, which holds a `current` source and swaps it once,
  atomically. This is the seam the remote→local switch rides on: a read captures
  its source at call entry, so in-flight remote reads finish from remote while
  only new reads go local (C17).
- **`fallback-decision.ts`** — `decideFallback(probe)`: the range-vs-fallback
  table (C5, C6) as one pure function. `206`+size → on-demand ranges; `200` →
  eager local (the host ignored Range and streamed the whole file); `404` →
  missing; `416` → corrupt; anything else → unusable-link.
- **`asset-provider.ts`** — `RangeZipAssetProvider`, the contract's `AssetProvider`
  (D14). Generic over an injected `loadAssetBlob(id)` backing + URL minter, it owns
  ref-counting (balanced `getAssetUrl`/`release`, one revoke at count 0, concurrent
  same-id dedupe) and the retry policy (transient → bounded backoff; structural →
  immediate fail; a failed load evicts itself so zone re-entry retries fresh).
- **`errors.ts`** — `TourLoadError` (fatal load tier, discriminated `loadCause`)
  and `StructuralAssetError` (permanent per-asset failure marker).

## Public API

```ts
interface ByteSource {
  readonly size: number;
  read(offset, length): Promise<Uint8Array>;
}
class SwitchableByteSource implements ByteSource {
  switchTo(next: ByteSource): void;
}

function decideFallback(probe: ProbeResult): FallbackDecision;

class RangeZipAssetProvider implements AssetProvider {
  getAssetUrl(id): Promise<string>;
  release(id): void;
}

class TourLoadError extends Error {
  readonly loadCause: TourLoadCause;
}
class StructuralAssetError extends Error {}
```

## Invariants

- `SwitchableByteSource` swaps **at most once** (`switchTo` after the first is a
  no-op) and never redirects an already-issued read.
- `RangeZipAssetProvider`: `getAssetUrl`/`release` calls must balance; the URL is
  revoked exactly once, when the ref-count hits 0; one id is loaded once even
  under concurrent/repeat requests.
- `StructuralAssetError` is never retried; every other backing rejection is.

## Examples

```ts
const src = new SwitchableByteSource(remote);
// … background warm completes …
src.switchTo(local); // new reads local; in-flight reads still finish on remote

const provider = new RangeZipAssetProvider({ loadAssetBlob });
const url = await provider.getAssetUrl("knight");
// … use url …
provider.release("knight");
```

## Tests

`byte-source.test.ts` (delegate, switch, idempotent, in-flight), `fallback-decision.test.ts`
(the full status table), `asset-provider.test.ts` (mint, revoke, ref-count, dedupe,
transient-retry, structural-immediate, exhaustion+recovery), `errors.test.ts`
(typed cause). 17 unit tests, no network.
