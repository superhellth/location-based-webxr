/**
 * Property-based tests for Confirm Dialog Component
 *
 * Why this test file matters:
 * Property-based tests validate that core invariants hold across a wide range
 * of randomly generated inputs, catching edge cases that example-based tests
 * miss. For the confirm dialog, the key properties are:
 * - Any message can be displayed without error
 * - Resolve always returns a boolean (never throws)
 * - Dialog cleanup always removes the DOM element
 * - Calling destroyConfirmDialog always resolves pending promise with false
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  showConfirmDialog,
  isConfirmDialogVisible,
  destroyConfirmDialog,
} from './confirm-dialog';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for dialog messages (any non-empty printable string) */
const arbMessage = fc.string({ minLength: 1, maxLength: 200 });

/** Arbitrary for button labels */
const arbLabel = fc.string({ minLength: 1, maxLength: 50 });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Confirm Dialog — Property-Based Tests', () => {
  afterEach(() => {
    destroyConfirmDialog();
    document.body.innerHTML = '';
  });

  it('should display any message without throwing', () => {
    // Why: The dialog must handle arbitrary user-facing text (including
    // unicode, special chars, long strings) without crashing.
    fc.assert(
      fc.property(arbMessage, (message) => {
        destroyConfirmDialog();
        document.body.innerHTML = '';

        void showConfirmDialog({ message });

        const dialog = document.getElementById('confirm-dialog');
        expect(dialog).not.toBeNull();
        expect(isConfirmDialogVisible()).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('should always resolve with a boolean when confirm is clicked', async () => {
    // Why: The promise must always resolve to a boolean, never reject
    // or return undefined, regardless of the message content.
    await fc.assert(
      fc.asyncProperty(arbMessage, async (message) => {
        destroyConfirmDialog();
        document.body.innerHTML = '';

        const resultPromise = showConfirmDialog({ message });
        const confirmBtn = document.querySelector(
          '[data-testid="confirm-dialog-confirm"]'
        ) as HTMLButtonElement;
        confirmBtn.click();

        const result = await resultPromise;
        expect(typeof result).toBe('boolean');
        expect(result).toBe(true);
      }),
      { numRuns: 30 }
    );
  });

  it('should always resolve with false when cancel is clicked', async () => {
    // Why: Cancel must always resolve to false regardless of options.
    await fc.assert(
      fc.asyncProperty(arbMessage, async (message) => {
        destroyConfirmDialog();
        document.body.innerHTML = '';

        const resultPromise = showConfirmDialog({ message });
        const cancelBtn = document.querySelector(
          '[data-testid="confirm-dialog-cancel"]'
        ) as HTMLButtonElement;
        cancelBtn.click();

        const result = await resultPromise;
        expect(result).toBe(false);
      }),
      { numRuns: 30 }
    );
  });

  it('should always clean up DOM after resolution', async () => {
    // Why: No matter what message or labels are used, the dialog
    // must be removed from the DOM after the user responds.
    await fc.assert(
      fc.asyncProperty(
        arbMessage,
        arbLabel,
        arbLabel,
        async (message, confirmLabel, cancelLabel) => {
          destroyConfirmDialog();
          document.body.innerHTML = '';

          const resultPromise = showConfirmDialog({
            message,
            confirmLabel,
            cancelLabel,
          });

          // Click confirm to resolve
          const confirmBtn = document.querySelector(
            '[data-testid="confirm-dialog-confirm"]'
          ) as HTMLButtonElement;
          confirmBtn.click();
          await resultPromise;

          expect(document.getElementById('confirm-dialog')).toBeNull();
          expect(isConfirmDialogVisible()).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should always resolve pending promise with false on destroy', async () => {
    // Why: destroyConfirmDialog must cleanly resolve any pending promise
    // regardless of what message/options were used.
    await fc.assert(
      fc.asyncProperty(arbMessage, async (message) => {
        destroyConfirmDialog();
        document.body.innerHTML = '';

        const resultPromise = showConfirmDialog({ message });
        destroyConfirmDialog();

        const result = await resultPromise;
        expect(result).toBe(false);
        expect(isConfirmDialogVisible()).toBe(false);
      }),
      { numRuns: 30 }
    );
  });
});
