/**
 * `openRemoteTour` — the viewing-side entry point (C3). Turns a hosted zip URL
 * into a running tour: probe → parse the central directory + tour.json →
 * validate → build the `AssetProvider` → kick off the background warm.
 *
 * It owns no store and no URL parsing (C3): composition reads `?tour=`, calls
 * this, then dispatches `loadTour` + `initZones` and injects the provider into
 * the scene. Dependencies (`fetch`, the local cache store) are injected so the
 * whole flow runs against a fixture server in Node, where `caches` is absent
 * (C20).
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C3, C11, C16, C20)
 */

import {
  ZipReader,
  TextWriter,
  BlobWriter,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";

import type {
  AssetId,
  AssetProvider,
  AssetType,
  Tour,
} from "../../../store/types.js";
import { parseTourJson } from "../../packaging/core/parse-tour-json.js";
import { RangeZipAssetProvider } from "../core/asset-provider.js";
import { SwitchableByteSource } from "../core/byte-source.js";
import { decideFallback } from "../core/fallback-decision.js";
import { StructuralAssetError, TourLoadError } from "../core/errors.js";
import { ByteSourceReader } from "./byte-source-reader.js";
import {
  CacheApiStore,
  InMemoryLocalCacheStore,
  LocalCacheByteSource,
  type LocalCacheStore,
} from "./local-cache-source.js";
import {
  probeRemote,
  RemoteRangeByteSource,
  type FetchImpl,
} from "./remote-range-byte-source.js";

export interface OpenRemoteTourOptions {
  /** Defaults to a Cache API store in the browser (C20). */
  localCacheStore?: LocalCacheStore;
  /** Defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** Defaults to `URL.createObjectURL` (absent in Node — injected in tests). */
  createObjectUrl?: (blob: Blob) => string;
  /** Defaults to `URL.revokeObjectURL`. */
  revokeObjectUrl?: (url: string) => void;
}

export interface OpenedTour {
  readonly tour: Tour;
  readonly assetProvider: AssetProvider;
  /** Resolves once the local copy is warmed + switched (or immediately when
   *  already local); never rejects — a failed warm just stays on remote. */
  readonly cacheWarming: Promise<void>;
}

const WARM_MAX_ATTEMPTS = 3;
const WARM_BACKOFF_MS = [2000, 8000, 30000];

function mimeForAssetType(type: AssetType): string {
  switch (type) {
    case "model":
      return "model/gltf-binary";
    case "audio":
      return "audio/mpeg";
    case "sprite":
      return "image/png";
  }
}

export async function openRemoteTour(
  zipUrl: string,
  opts: OpenRemoteTourOptions = {},
): Promise<OpenedTour> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const store =
    opts.localCacheStore ??
    (typeof caches !== "undefined"
      ? new CacheApiStore()
      : new InMemoryLocalCacheStore());

  const { source, cacheWarming } = await openByteSource(
    zipUrl,
    store,
    fetchImpl,
  );

  // Parse the central directory + tour.json. The reader is intentionally NOT
  // closed — entry.getData() is called lazily for the tour's whole lifetime,
  // through whichever ByteSource is current at that moment.
  const reader = new ZipReader(new ByteSourceReader(source));
  let entries: Entry[];
  try {
    entries = await reader.getEntries();
  } catch {
    throw new TourLoadError("corrupt", `not a readable zip: ${zipUrl}`);
  }

  const entryByName = new Map<string, FileEntry>();
  for (const e of entries) {
    if (!e.directory) entryByName.set(e.filename, e);
  }

  const tour = await readTourJson(entryByName);
  const entryById = joinAssets(tour, entryByName);

  const assetProvider = new RangeZipAssetProvider({
    loadAssetBlob: (id) => loadAssetBlob(id, tour, entryById),
    createObjectUrl: opts.createObjectUrl,
    revokeObjectUrl: opts.revokeObjectUrl,
  });

  return { tour, assetProvider, cacheWarming };
}

/** Resolve the initial ByteSource (cached / eager-local / remote) + warm promise. */
async function openByteSource(
  zipUrl: string,
  store: LocalCacheStore,
  fetchImpl: FetchImpl,
): Promise<{ source: SwitchableByteSource; cacheWarming: Promise<void> }> {
  // Reuse a complete copy from a previous session — skip the network entirely,
  // but only if it still parses. A truncated/corrupt warm (e.g. a broken proxy
  // run that stored garbage) would otherwise brick this tour URL forever, since
  // the cache short-circuits before any network. If it no longer reads as a zip,
  // evict it and fall through to a fresh remote open.
  const cached = await store.get(zipUrl).catch(() => undefined);
  if (cached) {
    const source = new SwitchableByteSource(new LocalCacheByteSource(cached));
    if (await isReadableZip(source)) {
      return { source, cacheWarming: Promise.resolve() };
    }
    await store.delete(zipUrl).catch(() => undefined);
  }

  let probe;
  try {
    probe = await probeRemote(zipUrl, fetchImpl);
  } catch {
    throw new TourLoadError("cors", `cannot fetch (CORS/network): ${zipUrl}`);
  }

  const decision = decideFallback(probe);
  if (decision.mode === "reject") {
    throw new TourLoadError(decision.cause, `cannot open ${zipUrl}`);
  }

  if (decision.mode === "eager-local") {
    // A 200 already handed us the whole file: ingest + read locally at once.
    const blob = new Blob([decision.body as BlobPart]);
    await store.put(zipUrl, blob);
    return {
      source: new SwitchableByteSource(new LocalCacheByteSource(blob)),
      cacheWarming: Promise.resolve(),
    };
  }

  const source = new SwitchableByteSource(
    new RemoteRangeByteSource(zipUrl, decision.size, fetchImpl),
  );
  return { source, cacheWarming: warmCache(zipUrl, source, store, fetchImpl) };
}

/** Does this source read as a zip? Used to reject a poisoned cached copy. */
async function isReadableZip(source: SwitchableByteSource): Promise<boolean> {
  try {
    await new ZipReader(new ByteSourceReader(source)).getEntries();
    return true;
  } catch {
    return false;
  }
}

async function readTourJson(
  entryByName: Map<string, FileEntry>,
): Promise<Tour> {
  const tourEntry = entryByName.get("tour.json");
  if (!tourEntry) {
    throw new TourLoadError("invalid-tour-json", "tour.json missing from zip");
  }
  let text: string;
  try {
    text = await tourEntry.getData(new TextWriter());
  } catch {
    throw new TourLoadError("corrupt", "could not read tour.json bytes");
  }
  try {
    return parseTourJson(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new TourLoadError("invalid-tour-json", detail);
  }
}

/** Verify every referenced asset filename is present (contract invariant 3, C11). */
function joinAssets(
  tour: Tour,
  entryByName: Map<string, FileEntry>,
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
      "asset-missing-in-zip",
      `assets referenced but absent from zip: ${missing.join(", ")}`,
    );
  }
  return entryById;
}

async function loadAssetBlob(
  id: AssetId,
  tour: Tour,
  entryById: Map<AssetId, FileEntry>,
): Promise<Blob> {
  const entry = entryById.get(id);
  const asset = tour.assets.find((a) => a.id === id);
  if (!entry || !asset) {
    throw new StructuralAssetError(`unknown asset id: ${id}`);
  }
  return entry.getData(new BlobWriter(mimeForAssetType(asset.type)));
}

/**
 * Background warm (C16): low-priority full download → local cache → switch.
 * Bounded retry with backoff; on exhaustion, stay on remote (never rejects).
 */
async function warmCache(
  zipUrl: string,
  source: SwitchableByteSource,
  store: LocalCacheStore,
  fetchImpl: FetchImpl,
): Promise<void> {
  for (let attempt = 0; attempt < WARM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchImpl(zipUrl, { priority: "low" });
      if (!res.ok) throw new Error(`warm download failed: ${res.status}`);
      const blob = await res.blob();
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
