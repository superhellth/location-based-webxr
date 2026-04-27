/**
 * Reference Point Picker Module
 *
 * Provides a modal UI for selecting or creating reference point names.
 * Users can choose from existing ref points (for re-observation) or
 * enter a new custom name.
 *
 * Purpose:
 * - Enable consistent naming of reference points across sessions
 * - Allow multiple observations of the same physical point
 * - Provide autocomplete/suggestions from existing ref points
 *
 * Public API:
 * - showRefPointPicker(existingIds): Promise<RefPointPickerResult | null>
 * - hideRefPointPicker(): void
 * - isRefPointPickerVisible(): boolean
 * - createRefPointPickerHtml(): string
 *
 * Invariants:
 * - Only one picker can be shown at a time
 * - Result is null if user cancels
 * - Empty names are not allowed
 *
 * Tests: src/ui/ref-point-picker.test.ts
 */

import { createLogger } from 'gps-plus-slam-app-framework/utils/logger';
import { pushModalState, popModalState } from './navigation';

const log = createLogger('RefPointPicker');

/**
 * Result from the reference point picker
 */
export interface RefPointPickerResult {
  /** The selected or entered reference point ID */
  id: string;
  /** True if this is a new ref point, false if selecting existing */
  isNew: boolean;
}

/** Promise resolver for the current picker session */
let currentResolver: ((result: RefPointPickerResult | null) => void) | null =
  null;

/** Stores the existing IDs for filtering */
let existingRefPointIds: string[] = [];

/** Tracks how many times each ref point was used in the current session */
let currentSessionUsage: Map<string, number> = new Map();

/**
 * Generate the HTML content for the reference point picker modal.
 * This is called once to populate the modal container.
 */
export function createRefPointPickerHtml(): string {
  return `
    <div class="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <h2 class="text-xl font-bold mb-4 text-center text-white">
        Mark Reference Point
      </h2>
      
      <div class="space-y-4">
        <!-- Input for new/search -->
        <div>
          <label class="block text-sm text-gray-400 mb-1">
            Name (or select existing)
          </label>
          <input
            type="text"
            id="ref-point-picker-input"
            class="w-full bg-gray-700 text-white py-2 px-4 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="e.g., Bench Corner, Fountain..."
            autocomplete="off"
          />
        </div>
        
        <!-- Suggestions list -->
        <div id="ref-point-picker-list" class="max-h-48 overflow-y-auto space-y-1">
          <!-- Populated dynamically -->
        </div>
        
        <!-- Action buttons -->
        <div class="flex gap-3 mt-4">
          <button
            id="ref-point-picker-cancel"
            class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            id="ref-point-picker-confirm"
            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-all"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Check if the reference point picker is currently visible.
 */
export function isRefPointPickerVisible(): boolean {
  const modal = document.getElementById('ref-point-picker-modal');
  return modal !== null && !modal.classList.contains('hidden');
}

/**
 * Hide the reference point picker modal.
 */
export function hideRefPointPicker(): void {
  const modal = document.getElementById('ref-point-picker-modal');
  modal?.classList.add('hidden');
}

/**
 * Cancel the picker from outside (e.g., browser back button).
 * Resolves the pending promise with null and hides the modal.
 */
export function cancelRefPointPicker(): void {
  resolveWith(null);
}

/**
 * Render the suggestions list based on existing IDs and optional filter.
 * Partitions into unused (top) and used-in-current-session (bottom).
 */
function renderSuggestions(filter: string = ''): void {
  const list = document.getElementById('ref-point-picker-list');
  if (!list) {
    return;
  }

  // Clear existing content
  list.innerHTML = '';

  // Filter by search term
  const filterLower = filter.toLowerCase();
  const filtered = existingRefPointIds.filter((id) =>
    id.toLowerCase().includes(filterLower)
  );

  if (filtered.length === 0 && existingRefPointIds.length > 0) {
    list.innerHTML =
      '<p class="text-gray-500 text-sm text-center py-2">No matching reference points</p>';
    return;
  }

  if (existingRefPointIds.length === 0) {
    list.innerHTML =
      '<p class="text-gray-500 text-sm text-center py-2">No existing reference points in this scenario</p>';
    return;
  }

  // Partition: unused first, used last
  const unused = filtered.filter((id) => !currentSessionUsage.has(id));
  const used = filtered.filter((id) => currentSessionUsage.has(id));

  for (const id of unused) {
    const button = document.createElement('button');
    button.className =
      'w-full text-left bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded transition-all text-sm';
    button.textContent = id;
    button.addEventListener('click', () => handleSuggestionClick(id));
    list.appendChild(button);
  }

  for (const id of used) {
    const count = currentSessionUsage.get(id) ?? 0;
    const button = document.createElement('button');
    button.className =
      'w-full text-left bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded transition-all text-sm opacity-50';
    button.textContent = `${id} (used ${count}x)`;
    button.addEventListener('click', () => handleSuggestionClick(id));
    list.appendChild(button);
  }
}

/**
 * Handle click on a suggestion - select it immediately
 */
function handleSuggestionClick(id: string): void {
  // Fill the input for visual feedback
  const input = document.getElementById(
    'ref-point-picker-input'
  ) as HTMLInputElement | null;
  if (input) {
    input.value = id;
  }

  // Resolve with existing ref point
  resolveWith({ id, isNew: false });
}

/**
 * Handle confirm button click
 */
function handleConfirm(): void {
  // Guard: ignore if already resolved (button disabled after first click)
  const confirmBtn = document.getElementById(
    'ref-point-picker-confirm'
  ) as HTMLButtonElement | null;
  if (confirmBtn?.disabled) {
    return;
  }

  const input = document.getElementById(
    'ref-point-picker-input'
  ) as HTMLInputElement | null;
  const value = input?.value.trim() ?? '';

  if (!value) {
    // Don't allow empty names
    return;
  }

  // Check if it's an existing ref point or new
  const isExisting = existingRefPointIds.includes(value);
  resolveWith({ id: value, isNew: !isExisting });
}

/**
 * Handle cancel button click
 */
function handleCancel(): void {
  resolveWith(null);
}

/**
 * Handle input changes for filtering
 */
function handleInputChange(): void {
  const input = document.getElementById(
    'ref-point-picker-input'
  ) as HTMLInputElement | null;
  const filter = input?.value ?? '';
  renderSuggestions(filter);
}

/**
 * Resolve the current picker promise and hide the modal.
 * Disables the confirm button to prevent stale interactions.
 */
function resolveWith(result: RefPointPickerResult | null): void {
  // Disable confirm button to prevent double-submit
  const confirmBtn = document.getElementById(
    'ref-point-picker-confirm'
  ) as HTMLButtonElement | null;
  if (confirmBtn) {
    confirmBtn.disabled = true;
  }

  hideRefPointPicker();

  // Pop the history entry pushed by showRefPointPicker.
  // No-op if the browser back button already popped it.
  popModalState();

  if (currentResolver) {
    currentResolver(result);
    currentResolver = null;
  }
}

/**
 * Set up event listeners for the picker controls.
 * Called when showing the picker.
 */
function setupEventListeners(): void {
  const confirmBtn = document.getElementById('ref-point-picker-confirm');
  const cancelBtn = document.getElementById('ref-point-picker-cancel');
  const input = document.getElementById('ref-point-picker-input');

  // Remove old listeners by cloning (simple approach)
  if (confirmBtn) {
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode?.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', handleConfirm);
  }

  if (cancelBtn) {
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode?.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', handleCancel);
  }

  if (input) {
    const newInput = input.cloneNode(true) as HTMLInputElement;
    input.parentNode?.replaceChild(newInput, input);
    newInput.addEventListener('input', handleInputChange);
    // Focus the input
    setTimeout(() => newInput.focus(), 50);
  }
}

/**
 * Show the reference point picker modal and return user's selection.
 *
 * @param existingIds - Array of existing reference point IDs for suggestions
 * @param sessionUsage - Optional map of ref point IDs to observation counts in the current session
 * @returns Promise resolving to selection or null if cancelled
 */
export function showRefPointPicker(
  existingIds: string[],
  sessionUsage?: Map<string, number>
): Promise<RefPointPickerResult | null> {
  return new Promise((resolve) => {
    // Defense in depth: if a previous resolver is still pending (e.g., due to
    // concurrent calls that bypassed the caller's guard), resolve it with null
    // to prevent orphaned promises. (2026-02-27 Issue 2 recurring fix)
    if (currentResolver) {
      log.warn('Overwriting pending resolver — resolving previous with null');
      const staleResolver = currentResolver;
      currentResolver = null;
      staleResolver(null);
    }

    // Store resolver and existing IDs
    currentResolver = resolve;
    existingRefPointIds = existingIds;
    currentSessionUsage = sessionUsage ?? new Map<string, number>();

    // Show the modal
    const modal = document.getElementById('ref-point-picker-modal');
    if (!modal) {
      log.error(
        'Modal element not found. Ensure #ref-point-picker-modal exists in the DOM.'
      );
      resolve(null);
      return;
    }

    modal.classList.remove('hidden');

    // Push a history entry so the browser back button can close this modal
    pushModalState();

    // Re-enable confirm button for new session
    const confirmBtn = document.getElementById(
      'ref-point-picker-confirm'
    ) as HTMLButtonElement | null;
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }

    // Clear input
    const input = document.getElementById(
      'ref-point-picker-input'
    ) as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }

    // Render initial suggestions
    renderSuggestions();

    // Setup event listeners
    setupEventListeners();
  });
}
