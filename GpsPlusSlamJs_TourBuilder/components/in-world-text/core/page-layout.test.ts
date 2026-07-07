import { describe, expect, it } from "vitest";

import { hitToPageIntent, PAGE_PANEL_LAYOUT } from "./page-layout.js";

/** Centre (u,v) of a layout rect. */
const centre = (r: { x: number; y: number; w: number; h: number }) => ({
  u: r.x + r.w / 2,
  v: r.y + r.h / 2,
});

const BOTH = { canPrev: true, canNext: true };

describe("hitToPageIntent", () => {
  it("returns prev for a hit on the Prev button when allowed", () => {
    expect(hitToPageIntent(centre(PAGE_PANEL_LAYOUT.prev), BOTH)).toEqual({
      type: "prev",
    });
  });

  it("returns next for a hit on the Next button when allowed", () => {
    expect(hitToPageIntent(centre(PAGE_PANEL_LAYOUT.next), BOTH)).toEqual({
      type: "next",
    });
  });

  it("ignores a disabled Prev/Next button (dimmed edge)", () => {
    expect(
      hitToPageIntent(centre(PAGE_PANEL_LAYOUT.prev), {
        canPrev: false,
        canNext: true,
      }),
    ).toBeNull();
    expect(
      hitToPageIntent(centre(PAGE_PANEL_LAYOUT.next), {
        canPrev: true,
        canNext: false,
      }),
    ).toBeNull();
  });

  it("returns null for the text area, the indicator, and chrome", () => {
    expect(hitToPageIntent(centre(PAGE_PANEL_LAYOUT.text), BOTH)).toBeNull();
    expect(
      hitToPageIntent(centre(PAGE_PANEL_LAYOUT.indicator), BOTH),
    ).toBeNull();
    expect(hitToPageIntent({ u: 0.5, v: 0.5 }, BOTH)).toBeNull();
  });
});
