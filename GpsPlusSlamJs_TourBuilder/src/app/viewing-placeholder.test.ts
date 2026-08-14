/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import { mountViewingPlaceholder } from "./viewing-placeholder.js";

describe("mountViewingPlaceholder", () => {
  it("renders a message into root", () => {
    const root = document.createElement("div");
    mountViewingPlaceholder(root);

    expect(root.textContent).toMatch(/viewing mode/i);
  });

  it("destroy() clears the mounted DOM", () => {
    const root = document.createElement("div");
    const view = mountViewingPlaceholder(root);

    view.destroy();

    expect(root.innerHTML).toBe("");
  });
});
