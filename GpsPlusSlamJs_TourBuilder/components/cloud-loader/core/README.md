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
  table (C5, C6) as one pure function. `206`+size → on-demand ranges; `206`
  without any readable size → full-download degrade (zip.js cannot anchor the
  central directory, but one plain GET still works); `200` → eager local (the
  host ignored Range and streamed the whole file); `404` → missing; `416` →
  corrupt; anything else → unusable-link.
- **`asset-provider.ts`** — `RefCountedAssetProvider`, the contract's
  `AssetProvider` (D14). Generic over an injected `loadAssetBlob(id)` backing +
  URL minter — zip/range-free, so the same class can back the authoring
  `FilesAssetProvider` (D14d). It owns ref-counting (balanced
  `getAssetUrl`/`release`, one revoke at count 0, concurrent same-id dedupe) and
  the retry policy (transient → bounded backoff; structural → immediate fail; a
  failed load evicts itself so zone re-entry retries fresh).
- **`mime-for-asset.ts`** — `mimeForAsset(filename, type)`: MIME from the
  filename extension (`.ogg` ≠ `.mp3`, `.jpg` ≠ `.png`), with a per-`AssetType`
  default for unknown extensions.
- **`share-link.ts`** — `normalizeShareUrl(url, opts)`: the one provider-aware
  layer. Rewrites a pasted share _page_ link (Dropbox, GitHub blob, Google
  Drive, OneDrive) to the provider's raw download URL; everything unrecognized
  passes through byte-identical. Called once at the top of `openRemoteTour`, so
  the transport below stays provider-agnostic (C7).
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

function mimeForAsset(filename: string, type: AssetType): string;

function normalizeShareUrl(
  url: string,
  opts?: { googleDriveApiKey?: string },
): string;

class RefCountedAssetProvider implements AssetProvider {
  getAssetUrl(id): Promise<string>;
  release(id): void;
}

class TourLoadError extends Error {
  readonly loadCause: TourLoadCause;
}
class StructuralAssetError extends Error {}
```

## Invariants

- `SwitchableByteSource` swaps **at most once** (`switchTo` after the first
  successful swap is a no-op), refuses a source whose `size` differs from the
  original (zip offsets are anchored to it — mismatched bytes would corrupt
  every later read), and never redirects an already-issued read.
- `RefCountedAssetProvider`: `getAssetUrl`/`release` calls must balance; the URL is
  revoked exactly once, when the ref-count hits 0; one id is loaded once even
  under concurrent/repeat requests.
- `StructuralAssetError` is never retried; every other backing rejection is.
- `normalizeShareUrl` returns anything it does not positively recognize
  **byte-identical** — direct URLs, proxy URLs, relative paths, non-URLs.

## Examples

```ts
const src = new SwitchableByteSource(remote);
// … background warm completes …
src.switchTo(local); // new reads local; in-flight reads still finish on remote

const provider = new RefCountedAssetProvider({ loadAssetBlob });
const url = await provider.getAssetUrl("knight");
// … use url …
provider.release("knight");
```

## Tests

`byte-source.test.ts` (delegate, switch, idempotent, in-flight), `fallback-decision.test.ts`
(the full status table incl. the full-download degrade), `asset-provider.test.ts`
(mint, revoke, ref-count, dedupe, transient-retry, structural-immediate,
exhaustion+recovery), `mime-for-asset.test.ts` (extension wins, type default
fallback), `share-link.test.ts` (per-provider rewrites + strict passthrough),
`errors.test.ts` (typed cause). 40 unit tests, no network.
