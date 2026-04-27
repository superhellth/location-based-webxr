/**
 * DOM Helpers
 *
 * Shared utilities for DOM element lookup used across UI modules.
 */

/**
 * Get a required DOM element by ID. Throws if element is not found.
 * This ensures fail-fast behavior for critical UI elements.
 *
 * @param id - The element ID to look up
 * @param context - Optional context hint for the error message (e.g. "session-summary-panel markup")
 */
export function getRequiredElement<T extends HTMLElement = HTMLElement>(
  id: string,
  context?: string
): T {
  const element = document.getElementById(id);
  if (!element) {
    const hint = context ?? 'an element with this ID';
    throw new Error(
      `Required UI element '#${id}' not found. Check that the HTML contains ${hint}.`
    );
  }
  return element as T;
}
