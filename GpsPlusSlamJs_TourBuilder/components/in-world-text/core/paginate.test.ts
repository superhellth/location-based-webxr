import { describe, expect, it } from "vitest";

import { paginate } from "./paginate.js";

describe("paginate", () => {
  it("chunks lines into pages of at most linesPerPage", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
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
