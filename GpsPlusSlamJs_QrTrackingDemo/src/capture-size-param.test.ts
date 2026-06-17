/**
 * Tests for parseCaptureSizeParam — the WS-C on-device sweep enabler.
 *
 * Why this matters: the detection-resolution sweep is device-manual (no headless
 * BarcodeDetector), so the demo lets a tester pick the RGB capture size from the
 * URL. A bad value must be ignored (fall back to the framework default), never
 * shrink the blit to a degenerate size.
 */

import { describe, it, expect } from "vitest";
import { parseCaptureSizeParam } from "./capture-size-param";

describe("parseCaptureSizeParam", () => {
  it("reads a valid ?capture=<px> override", () => {
    expect(parseCaptureSizeParam("?capture=768")).toBe(768);
    expect(parseCaptureSizeParam("capture=1024")).toBe(1024);
  });

  it("floors a fractional value", () => {
    expect(parseCaptureSizeParam("?capture=800.9")).toBe(800);
  });

  it("returns undefined when the param is absent", () => {
    expect(parseCaptureSizeParam("")).toBeUndefined();
    expect(parseCaptureSizeParam("?foo=1")).toBeUndefined();
  });

  it("rejects non-numeric and out-of-range values (defensive)", () => {
    expect(parseCaptureSizeParam("?capture=abc")).toBeUndefined();
    expect(parseCaptureSizeParam("?capture=0")).toBeUndefined();
    expect(parseCaptureSizeParam("?capture=64")).toBeUndefined(); // below floor
    expect(parseCaptureSizeParam("?capture=9999")).toBeUndefined(); // above ceiling
    expect(parseCaptureSizeParam("?capture=-512")).toBeUndefined();
  });
});
