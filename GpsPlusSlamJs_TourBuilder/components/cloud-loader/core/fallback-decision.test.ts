import { describe, expect, it } from "vitest";

import { decideFallback } from "./fallback-decision.js";

/**
 * Why these tests matter: this pure function is the whole §2.5.6 fallback
 * policy, lifted out of the network code so every branch is provable without a
 * server. The transport does one HEAD (for size) and one `Range: bytes=0-0` GET
 * (for support), hands the raw result here, and does what it's told. A 200 means
 * the host ignored our Range and streamed the whole file — so we already hold
 * the bytes and switch straight to a local read (the "still works, just no
 * instant first asset" guarantee). Getting this table wrong is exactly the
 * "range-unsupported link crashes instead of falling back" failure the spec
 * forbids.
 */

const SIZE = 4096;
const BODY = new Uint8Array([80, 75, 3, 4]); // "PK\x03\x04"

describe("decideFallback", () => {
  it("uses on-demand ranges when the probe returns 206 with a known size", () => {
    expect(decideFallback({ status: 206, size: SIZE })).toEqual({
      mode: "ranges",
      size: SIZE,
    });
  });

  it("falls back to an eager local read when a 200 streams the whole file", () => {
    expect(decideFallback({ status: 200, size: SIZE, body: BODY })).toEqual({
      mode: "eager-local",
      body: BODY,
    });
  });

  it("rejects a 404 as a missing tour", () => {
    expect(decideFallback({ status: 404, size: null })).toEqual({
      mode: "reject",
      cause: "missing",
    });
  });

  it("rejects a 416 as a corrupt/empty archive", () => {
    expect(decideFallback({ status: 416, size: 0 })).toEqual({
      mode: "reject",
      cause: "corrupt",
    });
  });

  it("degrades to a full download when ranges work but the size is unreadable", () => {
    // 206 with no readable Content-Length or Content-Range total: we can
    // range, but zip.js needs the total size to find the central directory.
    // A plain download still yields a working (if slower-to-start) tour.
    expect(decideFallback({ status: 206, size: null })).toEqual({
      mode: "full-download",
    });
  });

  it("rejects any other status (e.g. a 500) as an unusable link", () => {
    expect(decideFallback({ status: 500, size: null })).toEqual({
      mode: "reject",
      cause: "unusable-link",
    });
  });
});
