/**
 * `openRemoteTour` — turns a hosted zip archive URL into ready-to-use content:
 * probe → parse the central directory + a manifest entry → build the
 * `AssetProvider` → kick off the background warm.
 *
 * Fully generic over the manifest shape: the caller supplies `parseTour`, so
 * this module never imports (or knows about) any app-specific "Tour" type —
 * it only requires the parsed result to expose `.assets` (id/filename/type),
 * which is all it needs to serve asset bytes by id. Composition owns URL
 * parsing and store dispatch; this module owns neither. Other dependencies
 * (`fetch`, the local cache store) are injected too, so the whole flow runs
 * against a fixture server in Node, where `caches` is absent.
 */

import {
  ZipReader,
  TextWriter,
  BlobWriter,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js';

import {
  RefCountedAssetProvider,
  type AssetId,
  type AssetProvider,
} from './asset-provider.js';
import { SwitchableByteSource } from './byte-source.js';
import { decideFallback } from './range-probe.js';
import { StructuralAssetError, TourLoadError } from './tour-load-error.js';
import { mimeForAsset, type AssetType } from './mime-for-asset.js';
import { normalizeShareUrl } from './share-link.js';
import { ByteSourceReader } from './zip-byte-source-reader.js';
import {
  CacheApiStore,
  InMemoryLocalCacheStore,
  LocalCacheByteSource,
  type LocalCacheStore,
} from './local-cache-byte-source.js';
import {
  probeRemote,
  RemoteRangeByteSource,
  type FetchImpl,
} from './remote-range-byte-source.js';

export interface OpenRemoteTourOptions {
  /** Defaults to a Cache API store in the browser. */
  localCacheStore?: LocalCacheStore;
  /** Defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** Defaults to `URL.createObjectURL` (absent in Node — injected in tests). */
  createObjectUrl?: (blob: Blob) => string;
  /** Defaults to `URL.revokeObjectURL`. */
  revokeObjectUrl?: (url: string) => void;
  /** Google Drive API key — lets a pasted Drive share link resolve to the
   *  Range+CORS-capable `drive/v3 … alt=media` URL (public files only). */
  googleDriveApiKey?: string;
}

/** The one shape this module needs from a parsed manifest — asset lookup. */
export interface MinimalAsset {
  readonly id: string;
  readonly filename: string;
  readonly type: string;
}

/** Structural constraint on `parseTour`'s return type — nothing else is read. */
export interface MinimalParsedArchive {
  readonly assets: readonly MinimalAsset[];
}

export interface OpenedTour<T extends MinimalParsedArchive> {
  readonly tour: T;
  readonly assetProvider: AssetProvider;
  /** Resolves once the local copy is warmed + switched (or immediately when
   *  already local); never rejects — a failed warm just stays on remote. */
  readonly cacheWarming: Promise<void>;
}

const WARM_MAX_ATTEMPTS = 3;
const WARM_BACKOFF_MS = [2000, 8000, 30000];
/** Budget for one whole-archive download (warm or size-less fallback): generous
 *  enough for a media tour on cellular, bounded so a mid-stream stall fails and
 *  the retry/stay-on-remote policy takes over instead of hanging forever. */
const FULL_DOWNLOAD_TIMEOUT_MS = 300_000;

export async function openRemoteTour<T extends MinimalParsedArchive>(
  zipUrl: string,
  parseTour: (text: string) => T,
  opts: OpenRemoteTourOptions = {}
): Promise<OpenedTour<T>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const store =
    opts.localCacheStore ??
    (typeof caches !== 'undefined'
      ? new CacheApiStore()
      : new InMemoryLocalCacheStore());

  // The one provider-aware step: a pasted share page becomes the raw download
  // URL here, so everything below (probe, byte sources, cache keying) sees a
  // single canonical URL and stays provider-agnostic.
  const url = normalizeShareUrl(zipUrl, {
    googleDriveApiKey: opts.googleDriveApiKey,
  });

  const { cacheWarming, entries } = await openByteSource(url, store, fetchImpl);

  const entryByName = new Map<string, FileEntry>();
  for (const e of entries) {
    if (!e.directory) entryByName.set(e.filename, e);
  }

  const tour = await readTourJson(entryByName, parseTour);
  const entryById = joinAssets(tour, entryByName);

  const assetProvider = new RefCountedAssetProvider({
    loadAssetBlob: (id) => loadAssetBlob(id, tour, entryById),
    createObjectUrl: opts.createObjectUrl,
    revokeObjectUrl: opts.revokeObjectUrl,
  });

  return { tour, assetProvider, cacheWarming };
}

interface OpenedByteSource {
  readonly source: SwitchableByteSource;
  readonly cacheWarming: Promise<void>;
  /** The parsed central directory — parsed exactly once per open. */
  readonly entries: Entry[];
}

/** Resolve the initial ByteSource (cached / local-copy / remote) + warm promise. */
async function openByteSource(
  zipUrl: string,
  store: LocalCacheStore,
  fetchImpl: FetchImpl
): Promise<OpenedByteSource> {
  // Reuse a complete copy from a previous session — skip the network entirely,
  // but only if it still parses. A truncated/corrupt warm (e.g. a broken proxy
  // run that stored garbage) would otherwise brick this tour URL forever, since
  // the cache short-circuits before any network. If it no longer reads as a zip,
  // evict it and fall through to a fresh remote open.
  const cached = await store.get(zipUrl).catch(() => undefined);
  if (cached) {
    const source = new SwitchableByteSource(new LocalCacheByteSource(cached));
    const entries = await readEntries(source);
    if (entries) return { source, cacheWarming: Promise.resolve(), entries };
    await store.delete(zipUrl).catch(() => undefined);
  }

  let probe;
  try {
    probe = await probeRemote(zipUrl, fetchImpl);
  } catch {
    throw new TourLoadError('cors', `cannot fetch (CORS/network): ${zipUrl}`);
  }

  const decision = decideFallback(probe);
  if (decision.mode === 'reject') {
    throw new TourLoadError(decision.cause, `cannot open ${zipUrl}`);
  }

  let opened: Omit<OpenedByteSource, 'entries'>;
  if (decision.mode === 'eager-local') {
    // A 200 already handed us the whole file: ingest + read locally at once.
    opened = await ingestFullCopy(zipUrl, decision.body, store);
  } else if (decision.mode === 'full-download') {
    // Ranges work but the total size is unreadable, so zip.js cannot anchor
    // the central directory — degrade to one plain download instead.
    opened = await ingestFullCopy(
      zipUrl,
      await downloadWhole(zipUrl, fetchImpl),
      store
    );
  } else {
    const source = new SwitchableByteSource(
      new RemoteRangeByteSource(zipUrl, decision.size, fetchImpl)
    );
    opened = {
      source,
      cacheWarming: warmCache(zipUrl, source, store, fetchImpl),
    };
  }

  const entries = await readEntries(opened.source);
  if (!entries) {
    throw new TourLoadError('corrupt', `not a readable zip: ${zipUrl}`);
  }
  return { ...opened, entries };
}

/**
 * Parse the central directory, or null if the bytes are not a zip. The reader
 * is intentionally NOT closed — entry.getData() is called lazily for the tour's
 * whole lifetime, through whichever ByteSource is current at that moment.
 */
async function readEntries(
  source: SwitchableByteSource
): Promise<Entry[] | null> {
  try {
    return await new ZipReader(new ByteSourceReader(source)).getEntries();
  } catch {
    return null;
  }
}

/** Store a complete archive locally and read from that copy from the start. */
async function ingestFullCopy(
  zipUrl: string,
  body: Uint8Array,
  store: LocalCacheStore
): Promise<Omit<OpenedByteSource, 'entries'>> {
  const blob = new Blob([body as BlobPart]);
  await store.put(zipUrl, blob);
  return {
    source: new SwitchableByteSource(new LocalCacheByteSource(blob)),
    cacheWarming: Promise.resolve(),
  };
}

/** One bounded plain GET of the whole archive (the size-less-ranges fallback). */
async function downloadWhole(
  zipUrl: string,
  fetchImpl: FetchImpl
): Promise<Uint8Array> {
  try {
    const res = await fetchImpl(zipUrl, {
      signal: AbortSignal.timeout(FULL_DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`full download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    throw new TourLoadError(
      'unusable-link',
      `host ranges without a readable size and full download failed: ${zipUrl}`
    );
  }
}

async function readTourJson<T extends MinimalParsedArchive>(
  entryByName: Map<string, FileEntry>,
  parseTour: (text: string) => T
): Promise<T> {
  const tourEntry = entryByName.get('tour.json');
  if (!tourEntry) {
    throw new TourLoadError('invalid-tour-json', 'tour.json missing from zip');
  }
  let text: string;
  try {
    text = await tourEntry.getData(new TextWriter());
  } catch {
    throw new TourLoadError('corrupt', 'could not read tour.json bytes');
  }
  try {
    return parseTour(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new TourLoadError('invalid-tour-json', detail);
  }
}

/** Verify every referenced asset filename is present in the archive. */
function joinAssets<T extends MinimalParsedArchive>(
  tour: T,
  entryByName: Map<string, FileEntry>
): Map<AssetId, FileEntry> {
  const entryById = new Map<AssetId, FileEntry>();
  const missing: string[] = [];
  for (const asset of tour.assets) {
    const entry = entryByName.get(asset.filename);
    if (entry) entryById.set(asset.id, entry);
    else missing.push(asset.filename);
  }
  if (missing.length > 0) {
    throw new TourLoadError(
      'asset-missing-in-zip',
      `assets referenced but absent from zip: ${missing.join(', ')}`
    );
  }
  return entryById;
}

async function loadAssetBlob<T extends MinimalParsedArchive>(
  id: AssetId,
  tour: T,
  entryById: Map<AssetId, FileEntry>
): Promise<Blob> {
  const entry = entryById.get(id);
  const asset = tour.assets.find((a) => a.id === id);
  if (!entry || !asset) {
    throw new StructuralAssetError(`unknown asset id: ${id}`);
  }
  // `asset.type` is a plain `string` here (MinimalAsset is structural, so this
  // module never assumes a fixed vocabulary) — the caller's real parseTour
  // return type always narrows it to `AssetType` in practice; mimeForAsset's
  // default-by-type lookup is what actually needs the literal union.
  return entry.getData(
    new BlobWriter(mimeForAsset(asset.filename, asset.type as AssetType))
  );
}

/**
 * Background warm (C16): low-priority full download → local cache → switch.
 * Bounded retry with backoff; on exhaustion, stay on remote (never rejects).
 */
async function warmCache(
  zipUrl: string,
  source: SwitchableByteSource,
  store: LocalCacheStore,
  fetchImpl: FetchImpl
): Promise<void> {
  for (let attempt = 0; attempt < WARM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchImpl(zipUrl, {
        priority: 'low',
        // Bounded so a mid-download stall counts as a failed attempt (retry /
        // stay-on-remote) instead of parking the warm forever.
        signal: AbortSignal.timeout(FULL_DOWNLOAD_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`warm download failed: ${res.status}`);
      const blob = await res.blob();
      if (blob.size !== source.size) {
        // Not the archive the zip was parsed against (redirect page, truncated
        // body) — caching it would poison the reload path. Failed attempt.
        throw new Error(
          `warm download size mismatch: got ${blob.size}, expected ${source.size}`
        );
      }
      await store.put(zipUrl, blob);
      source.switchTo(new LocalCacheByteSource(blob));
      return;
    } catch {
      if (attempt < WARM_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, WARM_BACKOFF_MS[attempt]));
      }
    }
  }
  // Exhausted: stay on remote. The tour keeps working via Range reads.
}
