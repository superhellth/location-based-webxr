/**
 * Pure layout + hit-mapping for the paginated text panel.
 *
 * The panel is a billboarded plane showing wrapped text with a footer bar that
 * holds a Prev button, a page indicator, and a Next button. This module owns the
 * one description of *where* those controls sit — normalized UV rectangles — so
 * the same layout both positions the pixels (via `describePanel`) and decides
 * what a tap means (`hitToPageIntent`). Interaction is therefore correct by
 * construction and identical across both rendering backends (plan D7).
 *
 * UV convention matches `THREE.PlaneGeometry` intersection UVs: origin (0,0) is
 * the bottom-left of the front face, u → right, v → up. The buttons are
 * deliberately large (≈0.17 m × 0.13 m on the default 0.6 m panel) so they are
 * comfortable tap / XR-ray targets (plan D6/D13).
 */

import { contains, type Rect } from "../../shared/panel-geometry.js";

export interface PagePanelLayout {
  readonly text: Rect; // wrapped-text area (upper region)
  readonly prev: Rect; // footer, left
  readonly indicator: Rect; // footer, centre ("2 / 5")
  readonly next: Rect; // footer, right
}

export const PAGE_PANEL_LAYOUT: PagePanelLayout = {
  text: { x: 0.05, y: 0.34, w: 0.9, h: 0.62 },
  prev: { x: 0.04, y: 0.02, w: 0.28, h: 0.28 },
  indicator: { x: 0.34, y: 0.02, w: 0.32, h: 0.28 },
  next: { x: 0.68, y: 0.02, w: 0.28, h: 0.28 },
};

export type PageIntent =
  | { readonly type: "prev" }
  | { readonly type: "next" }
  | null;

/**
 * Map a panel-local hit (u,v in [0,1]) to a navigation intent. A Prev/Next hit
 * only fires when that direction is currently available (`nav`), so a tap on a
 * dimmed edge button is a no-op. A hit on the text/indicator/chrome → `null`.
 */
export function hitToPageIntent(
  uv: { readonly u: number; readonly v: number },
  nav: { readonly canPrev: boolean; readonly canNext: boolean },
  layout: PagePanelLayout = PAGE_PANEL_LAYOUT,
): PageIntent {
  if (nav.canPrev && contains(layout.prev, uv.u, uv.v)) {
    return { type: "prev" };
  }
  if (nav.canNext && contains(layout.next, uv.u, uv.v)) {
    return { type: "next" };
  }
  return null;
}
