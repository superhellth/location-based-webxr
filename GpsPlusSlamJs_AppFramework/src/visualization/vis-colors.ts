/**
 * Centralized Visualization Color Palette
 *
 * Single source of truth for all semantic colors used across the app's
 * visualization layers (Three.js 3D scene and Leaflet 2D summary map).
 *
 * Each entry provides both hex (number, for Three.js) and css (string,
 * for Leaflet/CSS) formats. Some entries intentionally use different 3D/2D
 * shades — see inline comments.
 *
 * Tailwind classes in index.html (e.g., bg-yellow-400) cannot be dynamically
 * generated and must be kept in sync manually — search for "vis-colors" in
 * the HTML legend to find them.
 */

export const VIS_COLORS = {
  /** Raw GPS marker — yellow */
  RAW_GPS: { hex: 0xffff00, css: '#ffff00' },
  /** Fused VIO marker — cyan */
  FUSED_VIO: { hex: 0x00ffff, css: '#00ffff' },
  /** Alignment snapshot marker — red */
  ALIGNMENT_SNAPSHOT: { hex: 0xff0000, css: '#ff0000' },
  /** Prior reference point — green */
  PRIOR_REF_POINT: { hex: 0x00ff00, css: '#00ff00' },
  /** Current reference point — bright red in 3D, lighter red (#ff6b6b) in 2D for map visibility */
  CURRENT_REF_POINT: { hex: 0xff0000, css: '#ff6b6b' },
  /** Compass north indicator — red */
  COMPASS_NORTH: { hex: 0xff0000, css: '#ff0000' },
  /** Compass east indicator — blue */
  COMPASS_EAST: { hex: 0x0000ff, css: '#0000ff' },
  /** Compass south indicator — dark red */
  COMPASS_SOUTH: { hex: 0x884444, css: '#884444' },
  /** Compass west indicator — dark blue */
  COMPASS_WEST: { hex: 0x444488, css: '#444488' },
  /** Compass up indicator — green */
  COMPASS_UP: { hex: 0x00ff00, css: '#00ff00' },
  /** User GPS position marker — blue */
  USER_POSITION: { hex: 0x3b82f6, css: '#3b82f6' },
} as const;
