import { describe, expect, it } from "vitest";

import { resolveAppMode } from "./mode.js";

describe("resolveAppMode", () => {
  it("resolves to viewing when ?tour= is present", () => {
    expect(
      resolveAppMode(new URL("https://app.example/?tour=https://x/tour.zip")),
    ).toBe("viewing");
  });

  it("resolves to viewing when ?tour= is present but empty", () => {
    expect(resolveAppMode(new URL("https://app.example/?tour="))).toBe(
      "viewing",
    );
  });

  it("resolves to authoring when ?tour= is absent", () => {
    expect(resolveAppMode(new URL("https://app.example/"))).toBe("authoring");
  });

  it("resolves to authoring when an unrelated query string is present", () => {
    expect(resolveAppMode(new URL("https://app.example/?debug=1"))).toBe(
      "authoring",
    );
  });
});
