/**
 * The remote half of §2.5.4: HTTP Range reads straight against the hosted zip,
 * plus the opening probe (C5).
 *
 * The probe issues a HEAD (total size from the CORS-safelisted `Content-Length`,
 * which every provider exposes — unlike `Content-Range`) and a `Range: bytes=0-0`
 * GET (support detection). A `fetch` rejection here — a CORS block or a dropped
 * connection — propagates so the orchestrator can map it to a fatal
 * `TourLoadError` (C6): a CORS-blocked link is unrecoverable, since it defeats
 * both the range path and the full-body fallback.
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C5, C6)
 */

import type { ByteSource } from "../core/byte-source.js";
import { parseContentRangeTotal } from "../core/content-range.js";
import type { ProbeResult } from "../core/fallback-decision.js";

export type FetchImpl = typeof fetch;

/** HEAD for size + `bytes=0-0` GET for range support. Throws if `fetch` rejects. */
export async function probeRemote(
  url: string,
  fetchImpl: FetchImpl,
): Promise<ProbeResult> {
  let size: number | null = null;
  try {
    const head = await fetchImpl(url, { method: "HEAD" });
    const len = head.headers.get("content-length");
    if (len !== null && len !== "") size = Number(len);
  } catch {
    // Some hosts reject HEAD; fall through and let the range GET decide. A hard
    // network/CORS failure will re-throw from the GET below.
  }

  const probe = await fetchImpl(url, { headers: { Range: "bytes=0-0" } });

  if (probe.status === 200) {
    const body = new Uint8Array(await probe.arrayBuffer());
    return { status: 200, size: size ?? body.length, body };
  }

  // On a 206, if HEAD gave no size, recover it from Content-Range — this is what
  // makes the loader work behind a CORS proxy (or any host that answers a ranged
  // GET but no HEAD Content-Length). The proxy must expose Content-Range (C5).
  if (probe.status === 206 && size === null) {
    size = parseContentRangeTotal(probe.headers.get("content-range"));
  }

  // Drain the small range body so the connection can be reused/closed.
  await probe.arrayBuffer().catch(() => undefined);
  return { status: probe.status, size };
}

export class RemoteRangeByteSource implements ByteSource {
  readonly size: number;
  readonly #url: string;
  readonly #fetch: FetchImpl;

  constructor(url: string, size: number, fetchImpl: FetchImpl) {
    this.#url = url;
    this.size = size;
    this.#fetch = fetchImpl;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length - 1;
    const res = await this.#fetch(this.#url, {
      headers: { Range: `bytes=${offset}-${end}` },
    });
    if (!res.ok) {
      throw new Error(`range read failed (${res.status}) at ${offset}-${end}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
