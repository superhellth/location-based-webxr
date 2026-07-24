import { describe, expect, it } from "vitest";

import { RemoteRangeByteSource } from "./remote-range-byte-source.js";

/**
 * Why this test matters: Node's global `fetch` (undici) tolerates being called
 * through an arbitrary receiver — `this.someField(...)` — so the whole
 * integration suite (which injects the real Node `fetch`) stayed green while
 * `RemoteRangeByteSource` was silently broken. A *browser* `fetch` is a WebIDL
 * "unforgeable" method: it brand-checks its receiver and throws
 * `TypeError: Illegal invocation` when invoked as `obj.method()` on anything
 * other than the global scope. `RemoteRangeByteSource` stored the injected
 * `fetchImpl` in a private field and called it as `this.#fetch(...)` — a
 * method-style call — which only a real browser fetch objects to. This fake
 * reproduces exactly that brand check without needing a browser.
 */

/** Mimics a browser-native `fetch`: throws if invoked with a foreign receiver. */
function browserLikeFetch(): typeof fetch {
  return function fetchImpl(this: unknown): Promise<Response> {
    if (this !== undefined) {
      throw new TypeError("Illegal invocation");
    }
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { "content-range": "bytes 0-2/3" },
      }),
    );
  };
}

describe("RemoteRangeByteSource", () => {
  it("reads without rebinding `this` on the injected fetch", async () => {
    const source = new RemoteRangeByteSource(
      "https://example.com/tour.zip",
      3,
      browserLikeFetch(),
    );

    await expect(source.read(0, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });
});
