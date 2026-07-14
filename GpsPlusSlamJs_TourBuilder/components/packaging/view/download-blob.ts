/**
 * `downloadBlob` — hand a generated Blob to the browser as a file download.
 *
 * The one browser side effect of the packaging component: `packTour` produces
 * bytes, this puts them on disk. Kept out of `core/` so the packing logic stays
 * DOM-free and unit-testable.
 */

/** Save `blob` to the user's downloads as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Deferred a tick: revoking synchronously after click() can cancel the
  // download before the browser has read the URL (Firefox).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
