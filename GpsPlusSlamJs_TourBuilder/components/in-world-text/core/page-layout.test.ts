import { describe, expect, it } from "vitest";

import { hitToPageIntent, PAGE_PANEL_LAYOUT, paginate } from "./page-layout.js";

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
    expect(hitToPageIntent(centre(PAGE_PANEL_LAYOUT.indicator), BOTH)).toBeNull();
    expect(hitToPageIntent({ u: 0.5, v: 0.5 }, BOTH)).toBeNull();
  });
});

describe("paginate", () => {
  it("chunks lines into pages of at most linesPerPage", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("fills whole pages when evenly divisible", () => {
    expect(paginate(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns a single empty page for empty input", () => {
    expect(paginate([], 3)).toEqual([[]]);
  });

  it("returns a single page when there are fewer lines than a page", () => {
    expect(paginate(["only", "two"], 8)).toEqual([["only", "two"]]);
  });

  it("throws when linesPerPage is < 1", () => {
    expect(() => paginate(["a"], 0)).toThrow();
  });
});
