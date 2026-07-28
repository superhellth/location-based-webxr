/**
 * Fatal load-time failures for the cloud-storage tour source.
 *
 * `TourLoadError` is the first of the two error tiers (C14): it aborts the whole
 * `openRemoteTour` and is surfaced to the onboarding gate as "this tour link
 * isn't usable / this file is broken". The second tier — a soft per-asset
 * `getAssetUrl` rejection that only degrades a single waypoint — is a plain
 * rejection, not this type.
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C6, C11, C14)
 */

/** Why a tour failed to open. The onboarding gate branches on this. */
export type TourLoadCause =
  | "unusable-link" // no size / opaque response — cannot range or read a body
  | "cors" // cross-origin read blocked by the browser
  | "corrupt" // truncated / garbage bytes / 416 on a non-empty archive
  | "missing" // 404
  | "invalid-tour-json" // tour.json absent or fails validateTour
  | "asset-missing-in-zip"; // a referenced AssetEntry.filename is not in the zip

/**
 * A *permanent* per-asset failure (the second error tier, C15): an unknown id,
 * an entry missing from the central directory, a decode error, or a 4xx on a
 * range read (expired signed link, file gone). The asset-provider fails these
 * immediately — retrying cannot fix them. Any other rejection from the blob
 * backing is treated as transient and retried.
 */
export class StructuralAssetError extends Error {
  override readonly name = "StructuralAssetError";
}

/** A fatal failure while opening a hosted tour.zip. */
export class TourLoadError extends Error {
  override readonly name = "TourLoadError";
  /** Named `loadCause` to avoid colliding with the standard `Error.cause`. */
  readonly loadCause: TourLoadCause;

  constructor(loadCause: TourLoadCause, message: string) {
    super(message);
    this.loadCause = loadCause;
  }
}
