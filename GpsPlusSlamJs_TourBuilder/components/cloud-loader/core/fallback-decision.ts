/**
 * The §2.5.6 range-vs-fallback policy as one pure function.
 *
 * The transport probes a hosted zip with a HEAD (total size from the
 * CORS-safelisted `Content-Length`) plus a `Range: bytes=0-0` GET (support
 * detection), then asks this function what to do. Keeping it pure means every
 * branch — including the ones that are a pain to trigger against a real cloud
 * provider — is unit-testable with no network (C5, C6).
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C5, C6)
 */

import type { TourLoadCause } from "./errors.js";

/** Raw result of the opening probe. */
export interface ProbeResult {
  /** HTTP status of the `Range: bytes=0-0` GET. */
  readonly status: number;
  /** Total archive size from HEAD `Content-Length`, or null if unreadable. */
  readonly size: number | null;
  /** Full body — present only when the host ignored Range and answered 200. */
  readonly body?: Uint8Array;
}

/** What the transport should do next. */
export type FallbackDecision =
  | { readonly mode: "ranges"; readonly size: number }
  | { readonly mode: "eager-local"; readonly body: Uint8Array }
  | { readonly mode: "reject"; readonly cause: TourLoadCause };

export function decideFallback(probe: ProbeResult): FallbackDecision {
  if (probe.status === 206 && probe.size !== null) {
    return { mode: "ranges", size: probe.size };
  }
  if (probe.status === 200 && probe.body !== undefined) {
    return { mode: "eager-local", body: probe.body };
  }
  if (probe.status === 404) {
    return { mode: "reject", cause: "missing" };
  }
  if (probe.status === 416) {
    // A 416 on `bytes=0-0` means the archive is empty/unsatisfiable — treat as
    // a broken file, not a usable tour.
    return { mode: "reject", cause: "corrupt" };
  }
  return { mode: "reject", cause: "unusable-link" };
}
