import { describe, expect, it } from "vitest";

import { DEFAULT_TEXT_STYLE, resolveTextStyle } from "./text-style.js";
import { PAGE_PANEL_LAYOUT } from "./page-layout.js";

describe("resolveTextStyle", () => {
  const resolved = resolveTextStyle(DEFAULT_TEXT_STYLE);

  it("keeps a 4:3 texture and derives the plane size from maxWidthMeters", () => {
    expect(resolved.canvasW).toBe(1024);
    expect(resolved.canvasH).toBe(768);
    expect(resolved.planeW).toBeCloseTo(0.6, 6);
    expect(resolved.planeH).toBeCloseTo(0.6 * (768 / 1024), 6);
  });

  it("wraps slightly narrower than the text rect (safety margin)", () => {
    expect(resolved.wrapWidthPx).toBeCloseTo(
      PAGE_PANEL_LAYOUT.text.w * 1024 * 0.95,
      6,
    );
  });

  it("derives maxLinesPerPage from the text-rect height / line height", () => {
    const rectHeightPx = PAGE_PANEL_LAYOUT.text.h * 768;
    expect(resolved.maxLinesPerPage).toBe(
      Math.floor(rectHeightPx / DEFAULT_TEXT_STYLE.lineHeightPx),
    );
    expect(resolved.maxLinesPerPage).toBeGreaterThanOrEqual(1);
  });
});
