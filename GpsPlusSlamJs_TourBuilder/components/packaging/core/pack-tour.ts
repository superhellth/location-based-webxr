/**
 * `packTour` — bundle a tour + its asset bytes into an uncompressed `tour.zip`
 * (Component 5, the authoring-side export step).
 *
 * **Store mode, not DEFLATE.** Every entry is written with `level: 0` so
 * component 6 can range-read an individual asset as a plain byte slice with no
 * decompression step. Compression would buy almost nothing anyway: tour assets
 * are already-compressed formats (GLB, MP3/OGG, JPG/PNG).
 *
 * Scope: this does NOT validate the tour schema — the caller's `Tour` is typed
 * and normally comes from `selectExportedTour`. It DOES validate the ZIP layout
 * (asset coverage + entry paths), because those failures are invisible in the
 * artifact rather than caught by the type system.
 *
 * @see plans/Shared-Contract.md §1 (schema + Invariant 3)
 * @see plans/2026-07-14-packaging-plan.md (decisions 4, 5, 6, 10, 12, 14)
 */

import { zip, strToU8, type AsyncZippable, type ZipOptions } from "fflate";

import type { AssetId, Tour } from "../../../store/types.js";

/** Every failure this module reports: missing asset bytes, or an unusable path. */
export class PackagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagingError";
  }
}

/** Path of the manifest at the ZIP root — the first thing component 6 reads. */
const TOUR_JSON = "tour.json";

/** Store mode: no DEFLATE, so assets stay byte-range readable. */
const STORE: ZipOptions = { level: 0 };

/** An asset resolved to the bytes that will be written at its in-zip path. */
interface ResolvedAsset {
  readonly filename: string;
  readonly file: File;
}

/**
 * Pair every declared asset with its `File`.
 *
 * @throws {PackagingError} listing ALL ids with no file — the author fixes one
 * round-trip instead of discovering them one at a time.
 */
function resolveAssets(
  tour: Tour,
  assetFiles: Map<AssetId, File>,
): ResolvedAsset[] {
  const resolved: ResolvedAsset[] = [];
  const missing: AssetId[] = [];

  for (const asset of tour.assets) {
    const file = assetFiles.get(asset.id);
    if (file === undefined) missing.push(asset.id);
    else resolved.push({ filename: asset.filename, file });
  }

  if (missing.length > 0) {
    throw new PackagingError(
      `packTour: no File provided for asset id(s): ${missing.join(", ")}`,
    );
  }
  return resolved;
}

/** Why `filename` cannot be used as a ZIP entry path, or `null` if it can. */
function pathProblem(filename: string): string | null {
  if (filename === "") return "is empty";
  if (filename === TOUR_JSON) return `collides with the ${TOUR_JSON} manifest`;
  if (filename.startsWith("/")) return "is an absolute path";
  if (/^[a-zA-Z]:/.test(filename)) return "is a drive-lettered path";
  if (filename.includes("\\")) return "contains a backslash separator";
  if (filename.split("/").includes("..")) return "escapes via a '..' segment";
  return null;
}

/**
 * Reject any asset filename that cannot be a ZIP entry path, and any duplicate.
 *
 * The duplicate check is the load-bearing one: ZIP entries are keyed by path, so
 * two assets sharing a filename would produce a valid archive that is silently
 * missing one of them — exactly what contract Invariant 3 ("every
 * `AssetEntry.filename` is present in the zip") asks this component to prevent.
 */
function assertUsableEntryPaths(tour: Tour): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const asset of tour.assets) {
    const problem = pathProblem(asset.filename);
    if (problem !== null) {
      problems.push(`'${asset.filename}' (asset ${asset.id}) ${problem}`);
    } else if (seen.has(asset.filename)) {
      problems.push(
        `'${asset.filename}' (asset ${asset.id}) is a duplicate entry path`,
      );
    }
    seen.add(asset.filename);
  }

  if (problems.length > 0) {
    throw new PackagingError(
      `packTour: unusable asset path(s): ${problems.join("; ")}`,
    );
  }
}

/** Promisified `fflate.zip` (async: a 40 MB GLB must not freeze the tab). */
function zipAsync(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, {}, (err, data) => {
      if (err)
        reject(new PackagingError(`packTour: zip failed — ${err.message}`));
      else resolve(data);
    });
  });
}

/**
 * Bundle a tour into an uncompressed ZIP Blob.
 *
 * @precondition `tour` has passed `validateTour` (or was produced by
 * `selectExportedTour` from the authoring slice).
 * @throws {PackagingError} if an `AssetId` in `tour.assets` has no `File` in
 * `assetFiles`, or if the asset filenames are not a safe, unique set. Both are
 * checked before any bytes are read, so a rejected call never leaves a partial
 * archive behind.
 */
export async function packTour(
  tour: Tour,
  assetFiles: Map<AssetId, File>,
): Promise<Blob> {
  const assets = resolveAssets(tour, assetFiles);
  assertUsableEntryPaths(tour);

  const files: AsyncZippable = {
    [TOUR_JSON]: [strToU8(JSON.stringify(tour)), STORE],
  };
  for (const { filename, file } of assets) {
    files[filename] = [new Uint8Array(await file.arrayBuffer()), STORE];
  }

  return new Blob([await zipAsync(files)], { type: "application/zip" });
}
