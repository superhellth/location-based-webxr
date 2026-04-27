/**
 * Tests for the centralized visualization color palette.
 *
 * Why these tests matter:
 * The color palette is the single source of truth for all visualization
 * colors used across Three.js (hex numbers) and Leaflet/CSS (hex strings).
 * These tests ensure the hex/css pairs stay consistent and that all
 * semantic colors are defined. Without them, a refactor could silently
 * break the hex↔css relationship.
 */
import { describe, it, expect } from 'vitest';
import { VIS_COLORS } from './vis-colors.js';

describe('VIS_COLORS', () => {
  /** Each entry must have both hex (number) and css (string) formats. */
  it('every color entry has hex (number) and css (string) fields', () => {
    for (const [name, entry] of Object.entries(VIS_COLORS)) {
      expect(typeof entry.hex, `${name}.hex`).toBe('number');
      expect(typeof entry.css, `${name}.css`).toBe('string');
      expect(entry.css, `${name}.css starts with #`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /** Verify hex↔css consistency: hex number and CSS string represent compatible colors.
   *  Some entries intentionally differ (e.g., REF_POINT uses lighter red in 2D). */
  it('hex and css are consistent for colors that should match', () => {
    const mustMatch = [
      'RAW_GPS',
      'FUSED_VIO',
      'ALIGNMENT_SNAPSHOT',
      'COMPASS_NORTH',
      'COMPASS_EAST',
      'COMPASS_SOUTH',
      'COMPASS_WEST',
      'COMPASS_UP',
    ] as const;

    for (const name of mustMatch) {
      const entry = VIS_COLORS[name];
      const expectedCss = `#${entry.hex.toString(16).padStart(6, '0')}`;
      expect(entry.css, `${name} hex↔css mismatch`).toBe(expectedCss);
    }
  });

  /** REF_POINT uses different shades in 3D (bright red) vs 2D (lighter red for map visibility). */
  it('CURRENT_REF_POINT intentionally uses different 3D and 2D shades', () => {
    expect(VIS_COLORS.CURRENT_REF_POINT.hex).toBe(0xff0000);
    expect(VIS_COLORS.CURRENT_REF_POINT.css).toBe('#ff6b6b');
  });

  /** All expected semantic color keys are present. */
  it('defines all expected semantic colors', () => {
    const requiredKeys = [
      'RAW_GPS',
      'FUSED_VIO',
      'ALIGNMENT_SNAPSHOT',
      'PRIOR_REF_POINT',
      'CURRENT_REF_POINT',
      'COMPASS_NORTH',
      'COMPASS_EAST',
      'COMPASS_SOUTH',
      'COMPASS_WEST',
      'COMPASS_UP',
      'USER_POSITION',
    ];
    for (const key of requiredKeys) {
      expect(VIS_COLORS).toHaveProperty(key);
    }
  });

  /**
   * Why this test matters:
   * The user-position marker in the Leaflet overlay must use the centralized
   * color rather than a hardcoded hex value. This guards against the
   * inconsistency flagged in the DOM hardcoding audit (Finding 4, P6).
   */
  it('USER_POSITION defines the blue marker color', () => {
    expect(VIS_COLORS.USER_POSITION.css).toBe('#3b82f6');
    expect(VIS_COLORS.USER_POSITION.hex).toBe(0x3b82f6);
  });
});
