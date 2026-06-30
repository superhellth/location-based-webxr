/**
 * Pure layout + hit-mapping for the in-world transport panel.
 *
 * The panel is a textured plane (a `CanvasTexture`) showing a play/stop button
 * and a horizontal progress bar. This module is the one place that knows *where*
 * those controls live on the panel — expressed as normalized rectangles in the
 * plane's UV space — so the same layout both draws the panel and decides what a
 * tap means. That keeps the interaction correct by construction and free of any
 * renderer: the view raycasts the panel, reads the hit UV, and asks
 * `hitToIntent` what to do.
 *
 * UV convention matches `THREE.PlaneGeometry` intersection UVs: origin (0,0) is
 * the bottom-left of the front face, u → right, v → up.
 */

/** A rectangle in normalized panel UV space ([0,1] × [0,1]). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PanelLayout {
  /** Play/stop button hit area. */
  readonly button: Rect;
  /** Progress-bar track hit area (seek maps along its width). */
  readonly track: Rect;
}

/**
 * Default panel layout: a square-ish button on the left, a wide track to its
 * right, vertically centred. Kept disjoint so the button-first resolution in
 * `hitToIntent` is unambiguous.
 */
export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  button: { x: 0.04, y: 0.25, w: 0.2, h: 0.5 },
  track: { x: 0.32, y: 0.38, w: 0.6, h: 0.24 },
};

export type PanelIntent =
  | { readonly type: "toggle" }
  | { readonly type: "seek"; readonly fraction: number }
  | null;

function contains(rect: Rect, u: number, v: number): boolean {
  return (
    u >= rect.x && u <= rect.x + rect.w && v >= rect.y && v <= rect.y + rect.h
  );
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Map a panel-local hit (u,v in [0,1]) to an intent. The button is resolved
 * first; a track hit becomes a `seek` at the fraction along the track width;
 * anything else (panel padding/chrome) is `null` (no-op).
 */
export function hitToIntent(
  uv: { readonly u: number; readonly v: number },
  layout: PanelLayout = DEFAULT_PANEL_LAYOUT,
): PanelIntent {
  if (contains(layout.button, uv.u, uv.v)) {
    return { type: "toggle" };
  }
  if (contains(layout.track, uv.u, uv.v)) {
    return {
      type: "seek",
      fraction: clamp01((uv.u - layout.track.x) / layout.track.w),
    };
  }
  return null;
}
