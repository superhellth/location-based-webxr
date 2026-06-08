import { describe, expect, it } from "vitest";

import {
  NO_ALIGNMENT_HINT,
  NO_SURFACE_HINT,
  decideAnchorPlacement,
} from "./placement-decision.js";

/**
 * Why these tests matter: this gate is the only thing standing between a Place
 * press and an anchor committed to a *meaningless* GPS position. It must place
 * only when both a surface is under the cursor and alignment is present, and
 * otherwise surface the matching, actionable hint (never silently no-op — per
 * the repo's async-UI-feedback rule). These cases pin both the happy path and
 * each blocked path independently.
 */
describe("decideAnchorPlacement", () => {
  it("places when a surface is under the cursor and alignment is present", () => {
    expect(
      decideAnchorPlacement({ reticleVisible: true, hasAlignment: true }),
    ).toEqual({ kind: "place" });
  });

  it("blocks with the point-at-the-ground hint when no surface is under the cursor", () => {
    expect(
      decideAnchorPlacement({ reticleVisible: false, hasAlignment: true }),
    ).toEqual({ kind: "blocked", hint: NO_SURFACE_HINT });
  });

  it("prioritises the no-surface hint even when alignment is also missing", () => {
    // Surface is the most actionable blocker ("point at the ground"), so it
    // wins over the alignment hint when both are missing.
    expect(
      decideAnchorPlacement({ reticleVisible: false, hasAlignment: false }),
    ).toEqual({ kind: "blocked", hint: NO_SURFACE_HINT });
  });

  it("blocks with the alignment hint when the surface is found but alignment has not arrived", () => {
    expect(
      decideAnchorPlacement({ reticleVisible: true, hasAlignment: false }),
    ).toEqual({ kind: "blocked", hint: NO_ALIGNMENT_HINT });
  });
});
