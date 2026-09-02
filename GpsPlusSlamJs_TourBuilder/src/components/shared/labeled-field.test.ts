// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildLabeledField } from "./labeled-field.js";

describe("buildLabeledField", () => {
  it("wraps the input in a label with the field testid and the label text", () => {
    const input = document.createElement("input");
    const field = buildLabeledField("Name", input, "tour-name");

    expect(field.tagName).toBe("LABEL");
    expect(field.className).toBe("field");
    expect(field.dataset["testid"]).toBe("field-tour-name");
    expect(field.textContent).toContain("Name");
    expect(field.contains(input)).toBe(true);
  });

  it("adds no hint button when hint is omitted", () => {
    const field = buildLabeledField("Name", document.createElement("input"), "tour-name");
    expect(field.querySelector('[data-testid="hint-tour-name"]')).toBeNull();
  });

  it("adds a hint button carrying the hint text when hint is given", () => {
    const field = buildLabeledField(
      "Prefetch (m)",
      document.createElement("input"),
      "prefetch-wp-1",
      "Starts downloading media at this distance.",
    );
    const hintButton = field.querySelector<HTMLButtonElement>(
      '[data-testid="hint-prefetch-wp-1"]',
    );
    expect(hintButton).not.toBeNull();
    expect(hintButton!.tagName).toBe("BUTTON");
    expect(hintButton!.querySelector(".hint-tip")?.textContent).toBe(
      "Starts downloading media at this distance.",
    );
  });
});
