/**
 * Pure `AssetEntry` construction for component 10 (TASK.md §2.3). Reuses
 * packaging's (component 5) `assetFilename` convention so a tour authored
 * here always packs cleanly — no second, drifting filename implementation.
 *
 * @see plans/2026-08-07-authoring-plan.md
 */

import { assetFilename } from "../../packaging/core/asset-filename.js";
import type { AssetEntry, AssetId, AssetType } from "../../../store/types.js";

/** Asset-backed content slots — mirrors authoring-slice's own `AssetSlot`. */
export type AssetSlot = "model" | "sprite" | "audio";

const SLOT_TYPE: Record<AssetSlot, AssetType> = {
  model: "model",
  sprite: "sprite",
  audio: "audio",
};

/** Builds the AssetEntry to register + attach for a picked File. */
export function buildAssetEntry(
  id: AssetId,
  slot: AssetSlot,
  file: File,
): AssetEntry {
  return {
    id,
    type: SLOT_TYPE[slot],
    filename: assetFilename(id, file),
  };
}
