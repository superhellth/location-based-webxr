/**
 * Viewing mode's temporary placeholder (plan
 * `plans/2026-08-14-authoring-composition-plan.md`, AC2). Replaced wholesale
 * by the Viewing-mode composition plan, which lands the real
 * cloud-loader → onboarding → proximity/AR-scene/map flow.
 */
export function mountViewingPlaceholder(root: HTMLElement): {
  destroy(): void;
} {
  const message = document.createElement("p");
  message.textContent =
    "Viewing mode composition lands next — this build only composes Authoring mode.";
  root.appendChild(message);

  return {
    destroy() {
      message.remove();
    },
  };
}
