/**
 * The swappable byte-source seam (§2.5.4).
 *
 * A `ByteSource` is random-access over one archive: "give me bytes
 * [offset, offset+length)". zip.js reads a tour's whole lifetime through a
 * single Reader backed by one of these; the Reader never learns whether the
 * bytes came from an HTTP Range fetch or the local cache. That indirection is
 * what lets the loading policy swap remote→local mid-session (contract §5).
 *
 * `SwitchableByteSource` holds the *current* source and flips it atomically
 * once the background download has warmed a local copy.
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C1, C17)
 */

/** Random-access byte source over a single archive. */
export interface ByteSource {
  /** Total archive size in bytes (fixed for the archive's lifetime). */
  readonly size: number;
  /** Read `length` bytes starting at `offset`. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/**
 * A `ByteSource` whose backing can be swapped once, atomically, without the
 * reader above it noticing (C17). The size is fixed at construction — every
 * source represents the same archive.
 */
export class SwitchableByteSource implements ByteSource {
  readonly size: number;
  #current: ByteSource;
  #switched = false;

  constructor(initial: ByteSource) {
    this.#current = initial;
    this.size = initial.size;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    return this.#current.read(offset, length);
  }

  /**
   * Swap the backing source. Only reads started *after* this see `next`, and
   * only the *first* call takes effect — a warm/fallback race that fires twice
   * must not re-swap (C17).
   */
  switchTo(next: ByteSource): void {
    if (this.#switched) return;
    this.#switched = true;
    this.#current = next;
  }
}
