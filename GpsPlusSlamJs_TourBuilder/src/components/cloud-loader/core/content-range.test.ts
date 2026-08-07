import { describe, expect, it } from "vitest";

import { parseContentRangeTotal } from "./content-range.js";

/**
 * Why this matters: it is the size fallback that makes the loader work behind a
 * CORS proxy (and any host that answers a ranged GET but no HEAD Content-Length).
 * A `206` always carries `Content-Range: bytes <start>-<end>/<total>`; when we
 * control the proxy we expose that header, and the `<total>` is the archive size
 * zip.js needs to find the central directory. A wrong parse here means a tour
 * that CORS is fixed for still fails with "unusable-link".
 */

describe("parseContentRangeTotal", () => {
  it("reads the total from a satisfied range", () => {
    expect(parseContentRangeTotal("bytes 0-0/12345")).toBe(12345);
    expect(parseContentRangeTotal("bytes 0-1023/2048")).toBe(2048);
  });

  it("reads the total from an unsatisfied-range form (bytes */total)", () => {
    expect(parseContentRangeTotal("bytes */4096")).toBe(4096);
  });

  it("returns null when the total is unknown (*) or the header is absent/garbage", () => {
    expect(parseContentRangeTotal("bytes 0-0/*")).toBeNull();
    expect(parseContentRangeTotal(null)).toBeNull();
    expect(parseContentRangeTotal("nonsense")).toBeNull();
  });
});
