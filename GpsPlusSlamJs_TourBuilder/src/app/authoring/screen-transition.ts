/**
 * Cross-fades one composed screen into the next: adds the `.screen-exit`
 * class (see `app.css`, 140ms fade + slide left), waits for the CSS
 * animation to finish, removes the outgoing element, then calls
 * `mountIncoming` — which is expected to append the next screen and add
 * `.screen-enter` to it (220ms fade + slide in from the right).
 *
 * Used for every hard-cut screen swap in the composed Authoring flow: gate →
 * tools, resume-prompt → tools, export → share.
 */
export function swapScreen(
  outgoing: HTMLElement,
  mountIncoming: () => void,
): void {
  outgoing.classList.add("screen-exit");
  outgoing.addEventListener(
    "animationend",
    () => {
      outgoing.remove();
      mountIncoming();
    },
    { once: true },
  );
}
