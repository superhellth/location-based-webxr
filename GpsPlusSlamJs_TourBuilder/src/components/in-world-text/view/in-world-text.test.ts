import { describe, expect, it, vi } from "vitest";
import { Texture, Vector3 } from "three";

import { PAGE_PANEL_LAYOUT } from "../core/page-layout.js";
import type { Measure } from "../core/text-wrap.js";
import { createInWorldText } from "./in-world-text.js";
import type { SurfaceDeps, SurfaceKind, TextSurface } from "./text-surface.js";

/**
 * These tests pin the *fallback wiring* — the reason the component has two
 * backends — without a GPU or DOM. The surface factory and the width measurer
 * are injected, so we can force the HTML backend to throw / stall / succeed and
 * assert that the label lands on the right backend and still renders a page
 * (plan R5). Everything runs in the default node environment.
 */

// Deterministic 10px-per-character measurer (no font/DOM needed).
const measure: Measure = (text) => text.length * 10;

const centre = (r: { x: number; y: number; w: number; h: number }) => ({
  u: r.x + r.w / 2,
  v: r.y + r.h / 2,
});

function workingSurface(): TextSurface {
  return {
    texture: new Texture(),
    render: vi.fn(),
    settled: () => Promise.resolve(),
    dispose: vi.fn(),
  };
}

/** Text long enough (10 single-line paragraphs) to span two 8-line pages. */
const TWO_PAGE_TEXT = Array.from({ length: 10 }, (_, i) => `line ${i}`).join(
  "\n",
);

// Pins pagination to the line height these fixtures were tuned against, so
// the pagination-navigation tests below don't drift if the app's default
// font size (`DEFAULT_TEXT_STYLE`) changes.
const TWO_PAGE_STYLE = { lineHeightPx: 56 };

describe("createInWorldText — backend selection & fallback", () => {
  it("uses the HTML backend on the happy path", async () => {
    const createSurface = vi.fn(
      (_kind: SurfaceKind, _deps: SurfaceDeps): TextSurface => workingSurface(),
    );
    const label = createInWorldText({
      text: "hello",
      position: new Vector3(),
      backend: "auto",
      measure,
      createSurface,
    });
    await label.ready;
    expect(label.activeBackend).toBe("html");
    expect(createSurface).toHaveBeenCalledWith("html", expect.anything());
  });

  it("forces the Canvas backend when backend='canvas'", async () => {
    const createSurface = vi.fn(
      (_kind: SurfaceKind, _deps: SurfaceDeps): TextSurface => workingSurface(),
    );
    const label = createInWorldText({
      text: "hello",
      position: new Vector3(),
      backend: "canvas",
      measure,
      createSurface,
    });
    await label.ready;
    expect(label.activeBackend).toBe("canvas");
    expect(createSurface).not.toHaveBeenCalledWith("html", expect.anything());
  });

  it("swaps to Canvas when the HTML render settles with a rejection", async () => {
    const canvas = workingSurface();
    const createSurface = (kind: SurfaceKind): TextSurface =>
      kind === "html"
        ? {
            ...workingSurface(),
            settled: () => Promise.reject(new Error("boom")),
          }
        : canvas;
    const label = createInWorldText({
      text: "hello",
      position: new Vector3(),
      backend: "auto",
      measure,
      createSurface,
    });
    await label.ready;
    expect(label.activeBackend).toBe("canvas");
    expect(canvas.render).toHaveBeenCalled();
  });

  it("swaps to Canvas when the HTML render throws synchronously", async () => {
    const canvas = workingSurface();
    const createSurface = (kind: SurfaceKind): TextSurface =>
      kind === "html"
        ? {
            ...workingSurface(),
            render: () => {
              throw new Error("render fail");
            },
          }
        : canvas;
    const label = createInWorldText({
      text: "hello",
      position: new Vector3(),
      backend: "auto",
      measure,
      createSurface,
    });
    await label.ready;
    expect(label.activeBackend).toBe("canvas");
    expect(canvas.render).toHaveBeenCalled();
  });

  it("swaps to Canvas when the HTML render never settles (timeout)", async () => {
    vi.useFakeTimers();
    try {
      const createSurface = (kind: SurfaceKind): TextSurface =>
        kind === "html"
          ? {
              ...workingSurface(),
              settled: () => new Promise<void>(() => undefined),
            }
          : workingSurface();
      const label = createInWorldText({
        text: "hello",
        position: new Vector3(),
        backend: "auto",
        htmlRenderTimeoutMs: 400,
        measure,
        createSurface,
      });
      await vi.advanceTimersByTimeAsync(500);
      await label.ready;
      expect(label.activeBackend).toBe("canvas");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createInWorldText — pagination & navigation", () => {
  it("paginates the text and steps between pages", async () => {
    const label = createInWorldText({
      text: TWO_PAGE_TEXT,
      position: new Vector3(),
      backend: "canvas",
      style: TWO_PAGE_STYLE,
      measure,
      createSurface: () => workingSurface(),
    });
    await label.ready;
    expect(label.pageLabel).toBe("1 / 2");

    // Page 1: Prev disabled, Next active.
    expect(label.hitTest(centre(PAGE_PANEL_LAYOUT.prev))).toBeNull();
    expect(label.hitTest(centre(PAGE_PANEL_LAYOUT.next))).toEqual({
      type: "next",
    });

    label.next();
    expect(label.pageLabel).toBe("2 / 2");
    // Page 2 (last): Next disabled, Prev active.
    expect(label.hitTest(centre(PAGE_PANEL_LAYOUT.next))).toBeNull();
    expect(label.hitTest(centre(PAGE_PANEL_LAYOUT.prev))).toEqual({
      type: "prev",
    });
  });

  it("setText re-paginates and resets to the first page", async () => {
    const label = createInWorldText({
      text: TWO_PAGE_TEXT,
      position: new Vector3(),
      backend: "canvas",
      style: TWO_PAGE_STYLE,
      measure,
      createSurface: () => workingSurface(),
    });
    await label.ready;
    label.next();
    expect(label.pageLabel).toBe("2 / 2");

    label.setText("short");
    expect(label.pageLabel).toBe("1 / 1");
  });
});
