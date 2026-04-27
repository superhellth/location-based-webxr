/**
 * DOM Helpers Tests
 *
 * Why this test matters:
 * Validates getRequiredElement — the shared fail-fast DOM lookup used by
 * all UI modules. Ensures it throws descriptive errors for missing elements
 * and returns the correct element when found.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getRequiredElement } from './dom-helpers';

describe('getRequiredElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns an existing element by ID', () => {
    document.body.innerHTML = '<div id="test-el">hello</div>';
    const el = getRequiredElement('test-el');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.textContent).toBe('hello');
  });

  it('returns the element with the correct generic type', () => {
    document.body.innerHTML = '<button id="btn">click</button>';
    const btn = getRequiredElement<HTMLButtonElement>('btn');
    expect(btn).toBeInstanceOf(HTMLButtonElement);
  });

  it('throws when element does not exist', () => {
    expect(() => getRequiredElement('nonexistent')).toThrow(
      "Required UI element '#nonexistent' not found"
    );
  });

  it('includes the element ID in the error message', () => {
    expect(() => getRequiredElement('my-widget')).toThrow('#my-widget');
  });

  it('includes custom context in the error when provided', () => {
    expect(() =>
      getRequiredElement('missing', 'settings-panel markup')
    ).toThrow('settings-panel markup');
  });

  it('uses default context when none is provided', () => {
    expect(() => getRequiredElement('missing')).toThrow(
      'an element with this ID'
    );
  });
});
