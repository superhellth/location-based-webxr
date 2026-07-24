/**
 * The local half of §2.5.4: a persistent full copy of the zip that on-demand
 * reads switch to once the background warm completes (C4, C18).
 *
 * `LocalCacheByteSource` serves ranges by slicing a `Blob` — lazy random access
 * with no heap blow-up, so a media-heavy tour never loads whole into memory.
 * `LocalCacheStore` abstracts *where* the complete copy lives: `CacheApiStore`
 * in the browser (evictable → guarded by `storage.persist()`), and
 * `InMemoryLocalCacheStore` for Node tests where `caches` does not exist (C20).
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C4, C18, C20)
 */

import type { ByteSource } from "../core/byte-source.js";

/** Random-access reader over a complete, locally-held zip Blob. */
export class LocalCacheByteSource implements ByteSource {
  readonly size: number;
  readonly #blob: Blob;

  constructor(blob: Blob) {
    this.#blob = blob;
    this.size = blob.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const slice = this.#blob.slice(offset, offset + length);
    return new Uint8Array(await slice.arrayBuffer());
  }
}

/** Persistent store of complete tour zips, keyed by URL. */
export interface LocalCacheStore {
  /** The complete cached copy, or undefined if not present. */
  get(url: string): Promise<Blob | undefined>;
  /** Store a complete copy atomically (only a finished copy is ever readable). */
  put(url: string, blob: Blob): Promise<void>;
  /** Evict a copy — used to purge a cached blob that no longer parses (C18). */
  delete(url: string): Promise<void>;
}

/** In-memory store — the Node test/demo backing where `caches` is unavailable. */
export class InMemoryLocalCacheStore implements LocalCacheStore {
  readonly #map = new Map<string, Blob>();

  get(url: string): Promise<Blob | undefined> {
    return Promise.resolve(this.#map.get(url));
  }

  put(url: string, blob: Blob): Promise<void> {
    this.#map.set(url, blob);
    return Promise.resolve();
  }

  delete(url: string): Promise<void> {
    this.#map.delete(url);
    return Promise.resolve();
  }
}

/**
 * Cache API store (browser). Requests persistent storage so a warmed tour is not
 * evicted mid-walk, and writes under a temp key promoted on completion so an
 * interrupted session never leaves a half-written "complete" copy (C18).
 *
 * Not exercised by the Node suite (`caches` is browser-only) — proven in the
 * manual demo (Option B, C19).
 */
export class CacheApiStore implements LocalCacheStore {
  readonly #cacheName: string;

  constructor(cacheName = "tour-zips") {
    this.#cacheName = cacheName;
  }

  async get(url: string): Promise<Blob | undefined> {
    const cache = await caches.open(this.#cacheName);
    const res = await cache.match(url);
    if (!res) return undefined;
    return res.blob();
  }

  async put(url: string, blob: Blob): Promise<void> {
    await navigator.storage?.persist?.();
    const cache = await caches.open(this.#cacheName);
    const tempKey = `${url}#warming`;
    // Write to a temp key first, then promote — a crash mid-write leaves only
    // the temp entry, never a truncated copy under the real key.
    await cache.put(tempKey, new Response(blob));
    await cache.put(url, new Response(blob));
    await cache.delete(tempKey);
  }

  async delete(url: string): Promise<void> {
    const cache = await caches.open(this.#cacheName);
    await cache.delete(url);
    await cache.delete(`${url}#warming`);
  }
}
