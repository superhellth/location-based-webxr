/**
 * Pure style + sizing resolution for the in-world text panel.
 *
 * Turns the authorable `TextStyle` (fonts, colours, panel width in metres) into
 * a `ResolvedTextStyle` with concrete canvas pixels and plane metres. The panel
 * is a fixed-aspect box; `maxLinesPerPage` and the text wrap width are *derived*
 * from the text UV rect and the line height, so the visuals and the hit regions
 * (which share `PAGE_PANEL_LAYOUT`) always line up — a line that overflows the
 * box is paginated, never clipped.
 *
 * Pure arithmetic: no Three.js, no DOM.
 */

import { PAGE_PANEL_LAYOUT } from "./page-layout.js";

export interface TextStyle {
  readonly fontPx: number;
  readonly lineHeightPx: number;
  readonly fontFamily: string;
  readonly panelColor: string; // panel background (semi-transparent, outdoors)
  readonly textColor: string; // body text
  readonly accentColor: string; // enabled Prev/Next buttons + indicator
  readonly mutedColor: string; // disabled (edge) buttons
  readonly maxWidthMeters: number; // physical panel width
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontPx: 120,
  lineHeightPx: 168,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  panelColor: "rgba(16, 19, 26, 0.9)",
  textColor: "#e9eef7",
  accentColor: "#4f8cff",
  mutedColor: "#39424f",
  maxWidthMeters: 0.6,
};

export interface ResolvedTextStyle extends TextStyle {
  readonly canvasW: number;
  readonly canvasH: number;
  readonly planeW: number; // metres
  readonly planeH: number; // metres
  readonly wrapWidthPx: number; // max line width fed to wrapText (with safety margin)
  readonly maxLinesPerPage: number; // derived from the text rect height / line height
}

/** Fixed 4:3 texture — crisp at ~1.5 m and cheap to re-raster. */
const CANVAS_W = 1024;
const CANVAS_H = 768;
/** Wrap slightly narrower than the text box so `measureText`↔CSS metric drift
 *  degrades to a hidden sub-pixel rather than an overflow/clip (plan R4). */
const WRAP_SAFETY = 0.95;

export function resolveTextStyle(style: TextStyle): ResolvedTextStyle {
  const planeW = style.maxWidthMeters;
  const planeH = planeW * (CANVAS_H / CANVAS_W);
  const textRectWidthPx = PAGE_PANEL_LAYOUT.text.w * CANVAS_W;
  const textRectHeightPx = PAGE_PANEL_LAYOUT.text.h * CANVAS_H;
  return {
    ...style,
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    planeW,
    planeH,
    wrapWidthPx: textRectWidthPx * WRAP_SAFETY,
    maxLinesPerPage: Math.max(
      1,
      Math.floor(textRectHeightPx / style.lineHeightPx),
    ),
  };
}
