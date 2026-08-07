/**
 * Adapts our swappable {@link ByteSource} to a zip.js `Reader` (C1, C2).
 *
 * This is the whole reason zip.js is here: it parses the central directory and
 * decompresses entries, while every actual byte read is delegated to the
 * ByteSource beneath — which may be a remote Range fetch or the local cache, and
 * may switch between them mid-session without zip.js ever noticing.
 */

import { Reader } from "@zip.js/zip.js";

import type { ByteSource } from "../core/byte-source.js";

export class ByteSourceReader extends Reader<ByteSource> {
  readonly #source: ByteSource;

  constructor(source: ByteSource) {
    super(source);
    this.#source = source;
    this.size = source.size;
  }

  override readUint8Array(index: number, length: number): Promise<Uint8Array> {
    // zip.js may request past EOF near the central directory — clamp to remaining.
    const clamped = Math.max(0, Math.min(length, this.size - index));
    return this.#source.read(index, clamped);
  }
}
