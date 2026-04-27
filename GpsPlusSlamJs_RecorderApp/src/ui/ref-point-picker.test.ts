/**
 * Reference Point Picker Tests
 *
 * Tests for the reference point picker UI component.
 * The picker allows users to select an existing reference point name
 * or enter a new one, enabling consistent naming across sessions.
 *
 * Why these tests matter:
 * - The picker is critical for cross-session reference point alignment
 * - User input validation prevents empty or duplicate names
 * - Promise-based API ensures proper async handling
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  showRefPointPicker,
  hideRefPointPicker,
  isRefPointPickerVisible,
  createRefPointPickerHtml,
  cancelRefPointPicker,
} from './ref-point-picker';
import {
  isModalStatePushed,
  destroyNavigation,
  initModalNavigation,
} from './navigation';

describe('Reference Point Picker', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a container for the picker
    container = document.createElement('div');
    container.id = 'ref-point-picker-modal';
    container.innerHTML = createRefPointPickerHtml();
    container.classList.add('hidden');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Cleanup
    document.body.removeChild(container);
    hideRefPointPicker();
    destroyNavigation();
  });

  describe('createRefPointPickerHtml', () => {
    it('should return valid HTML with required elements', () => {
      const html = createRefPointPickerHtml();

      expect(html).toContain('ref-point-picker-input');
      expect(html).toContain('ref-point-picker-list');
      expect(html).toContain('ref-point-picker-confirm');
      expect(html).toContain('ref-point-picker-cancel');
    });
  });

  describe('isRefPointPickerVisible', () => {
    it('should return false when picker is hidden', () => {
      container.classList.add('hidden');
      expect(isRefPointPickerVisible()).toBe(false);
    });

    it('should return true when picker is visible', () => {
      container.classList.remove('hidden');
      expect(isRefPointPickerVisible()).toBe(true);
    });

    it('should return false when picker element does not exist', () => {
      document.body.removeChild(container);
      expect(isRefPointPickerVisible()).toBe(false);
      // Re-add for cleanup
      document.body.appendChild(container);
    });
  });

  describe('hideRefPointPicker', () => {
    it('should add hidden class to picker modal', () => {
      container.classList.remove('hidden');
      hideRefPointPicker();
      expect(container.classList.contains('hidden')).toBe(true);
    });

    it('should not throw if picker does not exist', () => {
      document.body.removeChild(container);
      expect(() => hideRefPointPicker()).not.toThrow();
      // Re-add for cleanup
      document.body.appendChild(container);
    });
  });

  describe('showRefPointPicker', () => {
    it('should show the picker modal', async () => {
      // Start showing the picker (don't await - we'll interact with it)
      const resultPromise = showRefPointPicker([]);

      // Check that modal is visible
      expect(container.classList.contains('hidden')).toBe(false);

      // Click cancel to resolve the promise
      const cancelBtn = document.getElementById('ref-point-picker-cancel');
      cancelBtn?.click();

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should populate suggestions list with existing ref point IDs', async () => {
      const existingIds = ['RefPoint-A', 'Bench Corner', 'Fountain'];
      const resultPromise = showRefPointPicker(existingIds);

      // Check that suggestions are rendered
      const list = document.getElementById('ref-point-picker-list');
      expect(list).not.toBeNull();

      const buttons = list?.querySelectorAll('button');
      expect(buttons?.length).toBe(3);

      // Cancel to clean up
      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    it('should return selected existing ref point when clicked', async () => {
      const existingIds = ['RefPoint-A', 'Bench Corner'];
      const resultPromise = showRefPointPicker(existingIds);

      // Click on the first suggestion
      const list = document.getElementById('ref-point-picker-list');
      const firstButton = list?.querySelector('button');
      firstButton?.click();

      const result = await resultPromise;
      expect(result).not.toBeNull();
      expect(result?.id).toBe('RefPoint-A');
      expect(result?.isNew).toBe(false);
    });

    it('should return new ref point when user enters custom name', async () => {
      const resultPromise = showRefPointPicker([]);

      // Enter a custom name
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'My Custom Point';

      // Click confirm
      document.getElementById('ref-point-picker-confirm')?.click();

      const result = await resultPromise;
      expect(result).not.toBeNull();
      expect(result?.id).toBe('My Custom Point');
      expect(result?.isNew).toBe(true);
    });

    it('should return null when cancel is clicked', async () => {
      const resultPromise = showRefPointPicker(['RefPoint-A']);

      document.getElementById('ref-point-picker-cancel')?.click();

      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should not confirm with empty input when no suggestion selected', async () => {
      const resultPromise = showRefPointPicker([]);

      // Try to confirm with empty input
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = '';

      // Confirm should not work with empty input
      document.getElementById('ref-point-picker-confirm')?.click();

      // Modal should still be visible (not resolved)
      expect(isRefPointPickerVisible()).toBe(true);

      // Now cancel to clean up
      document.getElementById('ref-point-picker-cancel')?.click();
      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it('should trim whitespace from input', async () => {
      const resultPromise = showRefPointPicker([]);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = '  Trimmed Name  ';

      document.getElementById('ref-point-picker-confirm')?.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Trimmed Name');
    });

    it('should filter suggestions as user types', async () => {
      const existingIds = ['Bench', 'Fountain', 'Bench Corner', 'Tree'];
      const resultPromise = showRefPointPicker(existingIds);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;

      // Type 'Ben' to filter
      input.value = 'Ben';
      input.dispatchEvent(new Event('input'));

      // Check filtered list
      const list = document.getElementById('ref-point-picker-list');
      const visibleButtons = Array.from(
        list?.querySelectorAll('button') ?? []
      ).filter((btn) => !btn.classList.contains('hidden'));

      expect(visibleButtons.length).toBe(2); // 'Bench' and 'Bench Corner'

      // Cancel to clean up
      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    it('should pre-fill input when clicking suggestion', async () => {
      const existingIds = ['RefPoint-A', 'Bench Corner'];
      const resultPromise = showRefPointPicker(existingIds);

      // Click on suggestion
      const list = document.getElementById('ref-point-picker-list');
      const secondButton = list?.querySelectorAll('button')[1];
      secondButton?.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Bench Corner');

      // Check input was filled (for visual feedback before confirm)
      // Note: The implementation auto-confirms on click, so we just verify the result
      expect(result?.isNew).toBe(false);
    });
  });

  describe('Issue 5: confirm button disable after click', () => {
    // Why: Prevents multiple clicks on confirm from creating duplicates
    // when the picker is shown multiple times via rapid button taps.
    it('should disable confirm button after first confirm click', async () => {
      const resultPromise = showRefPointPicker([]);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Test Point';

      const confirmBtn = document.getElementById(
        'ref-point-picker-confirm'
      ) as HTMLButtonElement;

      confirmBtn.click();
      await resultPromise;

      // After resolving, confirm button should be disabled
      expect(confirmBtn.disabled).toBe(true);
    });

    // Why: Each new picker session must start with an enabled confirm button
    it('should re-enable confirm button when picker is shown again', async () => {
      // First session
      const resultPromise1 = showRefPointPicker([]);
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Test Point';
      document.getElementById('ref-point-picker-confirm')?.click();
      await resultPromise1;

      // Second session — confirm should be re-enabled
      const resultPromise2 = showRefPointPicker([]);
      const confirmBtn = document.getElementById(
        'ref-point-picker-confirm'
      ) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(false);

      // Cleanup
      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise2;
    });

    // Why: Clicking confirm twice rapidly should not resolve two different promises
    it('should ignore second confirm click after first resolves', async () => {
      const resultPromise = showRefPointPicker([]);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Test Point';

      const confirmBtn = document.getElementById(
        'ref-point-picker-confirm'
      ) as HTMLButtonElement;

      // Click confirm twice rapidly
      confirmBtn.click();
      confirmBtn.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Test Point');
      // Second click should have been ignored (button disabled after first)
      expect(confirmBtn.disabled).toBe(true);
    });

    // Why: Clicking cancel should also disable confirm to prevent stale interactions
    it('should disable confirm button after cancel click', async () => {
      const resultPromise = showRefPointPicker([]);

      const cancelBtn = document.getElementById(
        'ref-point-picker-cancel'
      ) as HTMLButtonElement;
      cancelBtn.click();
      await resultPromise;

      const confirmBtn = document.getElementById(
        'ref-point-picker-confirm'
      ) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    /**
     * Why this test matters (2026-02-27 Issue 2 — recurring multi-click bug):
     * If showRefPointPicker is called while a previous promise is still pending
     * (e.g., due to a race condition bypassing the caller's guard), the old
     * resolver must be resolved with null to prevent orphaned promises. Without
     * this, the old promise hangs forever inside handleMarkRefPoint and the
     * markRefPointInProgress lock is never released.
     */
    it('should resolve stale resolver with null when called again while pending', async () => {
      // Start first picker session (don't resolve it)
      const resultPromise1 = showRefPointPicker([]);

      // Start second picker session while first is still pending
      const resultPromise2 = showRefPointPicker([]);

      // First promise should resolve with null (stale resolver cleared)
      const result1 = await resultPromise1;
      expect(result1).toBeNull();

      // Second promise is now active — resolve it normally
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Test Point';
      document.getElementById('ref-point-picker-confirm')?.click();
      const result2 = await resultPromise2;
      expect(result2?.id).toBe('Test Point');
    });
  });

  describe('Issue 6: current-session usage indicators', () => {
    // Why: Users need to see which ref points they already used in this session
    // to avoid confusion when re-observing the same landmark.
    it('should accept a usage map as second parameter', async () => {
      const usage = new Map([['RefPoint-A', 1]]);
      const resultPromise = showRefPointPicker(
        ['RefPoint-A', 'RefPoint-B'],
        usage
      );

      // Should not throw
      expect(isRefPointPickerVisible()).toBe(true);

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: Already-used ref points should be visually distinct (grayed out)
    it('should render used ref points with "used" styling', async () => {
      const usage = new Map([['RefPoint-A', 2]]);
      const resultPromise = showRefPointPicker(
        ['RefPoint-A', 'RefPoint-B'],
        usage
      );

      const list = document.getElementById('ref-point-picker-list');
      const buttons = list?.querySelectorAll('button') ?? [];

      // Find the button for RefPoint-A
      const usedButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('RefPoint-A')
      );
      expect(usedButton).toBeDefined();
      expect(usedButton?.textContent).toContain('used 2x');
      expect(usedButton?.classList.contains('opacity-50')).toBe(true);

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: Unused ref points should appear BEFORE used ones in the list
    it('should partition list: unused first, used last', async () => {
      const usage = new Map([['RefPoint-A', 1]]);
      const resultPromise = showRefPointPicker(
        ['RefPoint-A', 'RefPoint-B', 'RefPoint-C'],
        usage
      );

      const list = document.getElementById('ref-point-picker-list');
      const buttons = Array.from(list?.querySelectorAll('button') ?? []);

      // RefPoint-B and RefPoint-C (unused) should come before RefPoint-A (used)
      expect(buttons.length).toBe(3);
      expect(buttons[0].textContent).toContain('RefPoint-B');
      expect(buttons[1].textContent).toContain('RefPoint-C');
      expect(buttons[2].textContent).toContain('RefPoint-A');

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: Used ref points must remain selectable for loop scenarios
    it('should still allow selecting a used ref point', async () => {
      const usage = new Map([['RefPoint-A', 1]]);
      const resultPromise = showRefPointPicker(
        ['RefPoint-A', 'RefPoint-B'],
        usage
      );

      const list = document.getElementById('ref-point-picker-list');
      const buttons = Array.from(list?.querySelectorAll('button') ?? []);

      // Click the used ref point (should be last)
      const usedButton = buttons.find((btn) =>
        btn.textContent?.includes('RefPoint-A')
      );
      usedButton?.click();

      const result = await resultPromise;
      expect(result).not.toBeNull();
      expect(result?.id).toBe('RefPoint-A');
      expect(result?.isNew).toBe(false);
    });

    // Why: Filtering should still work with partitioned lists
    it('should filter used and unused ref points together', async () => {
      const usage = new Map([['Bench', 1]]);
      const resultPromise = showRefPointPicker(
        ['Bench', 'Fountain', 'Bench Corner'],
        usage
      );

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Ben';
      input.dispatchEvent(new Event('input'));

      const list = document.getElementById('ref-point-picker-list');
      const buttons = Array.from(list?.querySelectorAll('button') ?? []);

      // Should show 'Bench Corner' (unused, first) and 'Bench' (used, last)
      expect(buttons.length).toBe(2);
      expect(buttons[0].textContent).toContain('Bench Corner');
      expect(buttons[1].textContent).toContain('Bench');
      expect(buttons[1].textContent).toContain('used 1x');

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: When no usage map is provided, behavior should be unchanged (backward compat)
    it('should work without usage map (backward compatible)', async () => {
      const resultPromise = showRefPointPicker(['RefPoint-A', 'RefPoint-B']);

      const list = document.getElementById('ref-point-picker-list');
      const buttons = list?.querySelectorAll('button');
      expect(buttons?.length).toBe(2);

      // No usage badges
      const btn = buttons?.[0];
      expect(btn?.textContent).not.toContain('used');
      expect(btn?.classList.contains('opacity-50')).toBe(false);

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: Usage count should display correct multiplier (1x, 2x, 3x etc.)
    it('should display correct usage count in badge', async () => {
      const usage = new Map([
        ['RefPoint-A', 3],
        ['RefPoint-B', 1],
      ]);
      const resultPromise = showRefPointPicker(
        ['RefPoint-A', 'RefPoint-B', 'RefPoint-C'],
        usage
      );

      const list = document.getElementById('ref-point-picker-list');
      const buttons = Array.from(list?.querySelectorAll('button') ?? []);

      // RefPoint-C is unused → first
      expect(buttons[0].textContent).toContain('RefPoint-C');
      // RefPoint-A used 3x and RefPoint-B used 1x → last
      const aBtn = buttons.find((b) => b.textContent?.includes('RefPoint-A'));
      const bBtn = buttons.find((b) => b.textContent?.includes('RefPoint-B'));
      expect(aBtn?.textContent).toContain('used 3x');
      expect(bBtn?.textContent).toContain('used 1x');

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });
  });

  describe('Issue 7: browser back button closes picker (navigation integration)', () => {
    let pushStateSpy: ReturnType<typeof vi.spyOn>;
    let backSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      pushStateSpy = vi.spyOn(history, 'pushState');
      backSpy = vi.spyOn(history, 'back').mockImplementation(() => {
        // jsdom doesn't fire popstate from history.back()
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Why: opening the picker must push a history state so the back button can close it
    it('should push modal history state when picker is shown', async () => {
      const resultPromise = showRefPointPicker(['RefPoint-A']);

      expect(pushStateSpy).toHaveBeenCalledOnce();
      expect(isModalStatePushed()).toBe(true);

      document.getElementById('ref-point-picker-cancel')?.click();
      await resultPromise;
    });

    // Why: confirm/cancel close must pop the history entry to keep history stack clean
    it('should pop modal history state when picker is confirmed', async () => {
      const resultPromise = showRefPointPicker([]);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Test Point';
      document.getElementById('ref-point-picker-confirm')?.click();

      await resultPromise;

      expect(backSpy).toHaveBeenCalledOnce();
      expect(isModalStatePushed()).toBe(false);
    });

    // Why: cancel should also pop the history entry
    it('should pop modal history state when picker is cancelled', async () => {
      const resultPromise = showRefPointPicker([]);

      document.getElementById('ref-point-picker-cancel')?.click();

      await resultPromise;

      expect(backSpy).toHaveBeenCalledOnce();
      expect(isModalStatePushed()).toBe(false);
    });

    // Why: clicking a suggestion auto-confirms, must also pop state
    it('should pop modal history state when suggestion is clicked', async () => {
      const resultPromise = showRefPointPicker(['RefPoint-A']);

      const list = document.getElementById('ref-point-picker-list');
      const btn = list?.querySelector('button');
      btn?.click();

      await resultPromise;

      expect(backSpy).toHaveBeenCalledOnce();
      expect(isModalStatePushed()).toBe(false);
    });

    // Why: browser back button should cancel the picker and resolve with null;
    // the handler must NOT call history.back() again (state already popped by browser)
    it('should cancel picker when popstate fires (simulating back button)', async () => {
      initModalNavigation(() => {
        // This callback should cancel the picker if it's visible
        if (isRefPointPickerVisible()) {
          cancelRefPointPicker();
        }
      });

      const resultPromise = showRefPointPicker(['RefPoint-A']);

      // Simulate browser back button
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

      const result = await resultPromise;
      expect(result).toBeNull();
      // history.back() should NOT have been called since browser already popped
      expect(backSpy).not.toHaveBeenCalled();
      expect(isModalStatePushed()).toBe(false);
    });
  });

  // =========================================================================
  // Bug investigation: naming inconsistencies in 2026-03-08 recordings
  // =========================================================================
  describe('Bug investigation: ref point naming (2026-03-08)', () => {
    // Context: Cross-recording analysis showed that same-name ref points
    // are 100-500m apart while different-name points can be at the same
    // physical spot. User reports having to press OK multiple times in the
    // dialog. Tests below probe specific failure modes.

    it('should not leak typed value from a previous picker session into the next', async () => {
      // Why: If the input retains text from a previous session, the user
      // might press confirm thinking the input is empty or has their new
      // text, but the old text is still there.

      // Session 1: type a name and confirm
      const result1Promise = showRefPointPicker(['Suggestion-A']);
      let input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Old Name From Session 1';
      document.getElementById('ref-point-picker-confirm')?.click();
      const result1 = await result1Promise;
      expect(result1?.id).toBe('Old Name From Session 1');

      // Session 2: show picker again — input should be empty
      const result2Promise = showRefPointPicker(['Suggestion-A']);
      input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      expect(input.value).toBe('');

      // Cancel session 2
      document.getElementById('ref-point-picker-cancel')?.click();
      await result2Promise;
    });

    it('should not leak suggestion selection from previous session', async () => {
      // Why: If suggestion click sets input.value and then a new session
      // opens, the input should be cleared (not retain the suggestion name).

      // Session 1: click a suggestion
      const result1Promise = showRefPointPicker(['Alpha', 'Beta']);
      const list1 = document.getElementById('ref-point-picker-list');
      const firstBtn = list1?.querySelector('button');
      firstBtn?.click();
      const result1 = await result1Promise;
      expect(result1?.id).toBe('Alpha');

      // Session 2: input should be empty
      const result2Promise = showRefPointPicker(['Alpha', 'Beta']);
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      expect(input.value).toBe('');

      // Confirm with a DIFFERENT name
      input.value = 'Gamma';
      document.getElementById('ref-point-picker-confirm')?.click();
      const result2 = await result2Promise;
      expect(result2?.id).toBe('Gamma');
    });

    it('should use current input value when confirm is clicked, not a stale reference', async () => {
      // Why: If handleConfirm reads from a stale DOM reference (old input
      // before cloneNode), it might read empty string instead of user's text.
      // This would explain "had to press OK multiple times" (empty → ignored).

      const resultPromise = showRefPointPicker(['Existing']);

      // Get the input that's actually in the DOM after setupEventListeners
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;

      // Simulate typing character by character (triggering input events)
      input.value = 'B';
      input.dispatchEvent(new Event('input'));
      input.value = 'Br';
      input.dispatchEvent(new Event('input'));
      input.value = 'Brücke';
      input.dispatchEvent(new Event('input'));

      // Now click confirm
      document.getElementById('ref-point-picker-confirm')?.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Brücke');
      expect(result?.isNew).toBe(true);
    });

    it('should resolve with typed text even when suggestions are visible', async () => {
      // Why: If the user types "Brücke" but sees "Brücke links" in
      // suggestions, clicking Confirm should use "Brücke", not "Brücke links".

      const resultPromise = showRefPointPicker([
        'Brücke links',
        'Eingang Pfad',
      ]);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Brücke';
      input.dispatchEvent(new Event('input'));

      // Verify suggestion is visible but we DON'T click it
      const list = document.getElementById('ref-point-picker-list');
      const buttons = list?.querySelectorAll('button') ?? [];
      expect(buttons.length).toBe(1); // Only "Brücke links" matches
      expect(buttons[0]?.textContent).toContain('Brücke links');

      // Click confirm — should use the typed input, NOT the suggestion
      document.getElementById('ref-point-picker-confirm')?.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Brücke');
      expect(result?.isNew).toBe(true); // "Brücke" ≠ "Brücke links"
    });

    it('should handle rapid 4-session sequence without cross-contamination', async () => {
      // Why: Simulates the actual recording scenario — 4 ref points marked
      // in quick succession. Each should get exactly the name the user typed.

      const suggestions = ['Brücke links', 'Bank', 'Eingang Pfad'];
      const expectedNames = [
        'Lärm Schild',
        'Bank',
        'Brücke links',
        'Eingang Pfad',
      ];

      for (let i = 0; i < expectedNames.length; i++) {
        const usage = new Map(
          expectedNames.slice(0, i).map((n) => [n, 1] as [string, number])
        );
        const resultPromise = showRefPointPicker(suggestions, usage);

        const input = document.getElementById(
          'ref-point-picker-input'
        ) as HTMLInputElement;
        expect(input.value).toBe(''); // Must start empty

        input.value = expectedNames[i];
        input.dispatchEvent(new Event('input'));

        document.getElementById('ref-point-picker-confirm')?.click();

        const result = await resultPromise;
        expect(result?.id).toBe(expectedNames[i]);
      }
    });

    it('should not resolve with wrong suggestion when user taps confirm after typing existing name', async () => {
      // Why: If the user types an exact existing name and clicks confirm,
      // the result should have isNew=false and the correct id.

      const resultPromise = showRefPointPicker(['Brücke links', 'Bank']);

      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Bank';
      input.dispatchEvent(new Event('input'));

      document.getElementById('ref-point-picker-confirm')?.click();

      const result = await resultPromise;
      expect(result?.id).toBe('Bank');
      expect(result?.isNew).toBe(false); // Exact match → existing
    });

    it('should correctly resolve when confirm is clicked, cancelled, then shown again', async () => {
      // Why: The "multiple OK presses" report — if first press resolves as
      // cancel (empty input), the user gets confused and tries again.
      // The next session must work correctly.

      // Session 1: show picker, press confirm with empty input (does nothing)
      const resultPromise1 = showRefPointPicker(['Alpha']);
      let input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      expect(input.value).toBe('');

      // Click confirm with empty input — should NOT resolve
      document.getElementById('ref-point-picker-confirm')?.click();
      expect(isRefPointPickerVisible()).toBe(true); // Still open

      // Now cancel
      document.getElementById('ref-point-picker-cancel')?.click();
      const result1 = await resultPromise1;
      expect(result1).toBeNull();

      // Session 2: show picker again, type name, confirm
      const resultPromise2 = showRefPointPicker(['Alpha']);
      input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;
      input.value = 'Beta';
      document.getElementById('ref-point-picker-confirm')?.click();
      const result2 = await resultPromise2;
      expect(result2?.id).toBe('Beta');
    });

    it('should handle the cloneNode input value correctly after setupEventListeners', async () => {
      // Why: setupEventListeners uses cloneNode(true) which clones the
      // HTML value attribute, NOT the JS .value property. If .value was set
      // before cloneNode but after the HTML attribute, the clone might
      // have an unexpected value.

      const resultPromise = showRefPointPicker([]);

      // After showRefPointPicker, setupEventListeners has already cloned
      // the input. Get the clone.
      const input = document.getElementById(
        'ref-point-picker-input'
      ) as HTMLInputElement;

      // Verify the clone starts with empty value
      expect(input.value).toBe('');
      expect(input.defaultValue).toBe('');

      // Type something
      input.value = 'Test Point';

      // Verify .value and .defaultValue diverge (as expected)
      expect(input.value).toBe('Test Point');
      // defaultValue should still be '' (unchanged by .value setter)
      expect(input.defaultValue).toBe('');

      // Confirm — should read .value, not .defaultValue
      document.getElementById('ref-point-picker-confirm')?.click();
      const result = await resultPromise;
      expect(result?.id).toBe('Test Point');
    });
  });
});
