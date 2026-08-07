import { describe, expect, it } from "vitest";

import { assetFilename } from "../../packaging/core/asset-filename.js";
import { buildAssetEntry } from "./asset-attachment.js";

/**
 * Why this matters: component 5 (packaging) owns the `assets/<id>.<ext>`
 * filename convention and its edge cases. This module must produce filenames
 * packaging agrees with — not a second, drifting implementation — so a tour
 * authored here always packs cleanly.
 */

describe("buildAssetEntry", () => {
  it("maps each slot to its AssetType", () => {
    const file = new File([], "knight.glb");
    expect(buildAssetEntry("a1", "model", file).type).toBe("model");
    expect(buildAssetEntry("a1", "sprite", file).type).toBe("sprite");
    expect(buildAssetEntry("a1", "audio", file).type).toBe("audio");
  });

  it("carries the given id through unchanged", () => {
    const file = new File([], "story.mp3");
    expect(buildAssetEntry("asset-7", "audio", file).id).toBe("asset-7");
  });

  it("delegates filename to packaging's assetFilename — no drift", () => {
    const file = new File([], "MODEL.GLB");
    expect(buildAssetEntry("knight", "model", file).filename).toBe(
      assetFilename("knight", file),
    );
  });
});
