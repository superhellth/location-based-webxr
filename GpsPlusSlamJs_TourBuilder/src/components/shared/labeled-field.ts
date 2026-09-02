/**
 * Shared "boxed field" builder: a `<label>` with the label text above the
 * value, used for every labeled value across the authoring composition
 * (Tour Details, waypoint radii, pack-and-share's link fields) so they all
 * look and behave the same way. Optionally carries a `(?)` hint button whose
 * popover text shows on hover or focus (tapping a focusable element focuses
 * it, so this also works on touch with no extra JS).
 */
export function buildLabeledField(
  labelText: string,
  input: HTMLElement,
  testid: string,
  hint?: string,
): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.dataset["testid"] = `field-${testid}`;

  const span = document.createElement("span");
  span.textContent = labelText;
  if (hint !== undefined) {
    span.appendChild(buildHintButton(hint, testid));
  }

  wrapper.append(span, input);
  return wrapper;
}

function buildHintButton(hint: string, testid: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hint-icon";
  button.dataset["testid"] = `hint-${testid}`;
  button.textContent = "?";

  const tip = document.createElement("span");
  tip.className = "hint-tip";
  tip.textContent = hint;
  button.appendChild(tip);

  return button;
}
