/**
 * Map Browser — destroy-safety unit tests.
 *
 * Why this test matters: `createMapBrowser` mounts a Leaflet map plus floating
 * overlays and is torn down via `destroy()` (called from `teardownMapBrowser`
 * when the user closes the map or switches folders). Teardown runs
 * `abort.abort()` then `destroy()` synchronously, but the coverage indexing
 * stream lets its in-flight workers finish — so `onProgress → setIndexingProgress`
 * and a clicked `onBackfill` can both resolve *after* `destroy()` has already
 * cleared the component's timers and detached its DOM. If those late callbacks
 * are not guarded, they mutate detached nodes and (worse) arm a NEW `setTimeout`
 * that `destroy()` can no longer clear — a leaked timer pinning the detached
 * DOM. `addRecording`/`scheduleRender` already early-return when `destroyed`;
 * these tests pin the same guard for the two remaining post-`destroy` entry
 * points (PR #87 review).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Leaflet before importing the module under test (repo pattern; see
// summary-map.test.ts / preview-map.test.ts).
vi.mock('leaflet', () => {
  const makeMap = () => ({
    setView: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    getZoom: vi.fn().mockReturnValue(2),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  });
  return {
    default: {
      map: vi.fn(() => makeMap()),
      layerGroup: vi.fn(() => ({
        addTo: vi.fn().mockReturnThis(),
        clearLayers: vi.fn(),
      })),
      polygon: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        setStyle: vi.fn(),
      })),
      latLngBounds: vi.fn(() => ({
        extend: vi.fn().mockReturnThis(),
        isValid: vi.fn().mockReturnValue(false),
      })),
    },
  };
});

vi.mock('./map-osm-base', () => ({
  addOsmTileLayer: vi.fn(),
  FIT_BOUNDS_PADDING: [20, 20] as [number, number],
}));

import { createMapBrowser } from './map-browser.js';
import type { BackfillResult } from '../storage/coverage-backfill.js';

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('map-browser destroy safety', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Fake timers let us count pending setTimeout()s directly (the leaked-timer
    // failure mode) without an `any`-typed spy on globalThis.setTimeout.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setIndexingProgress is a no-op after destroy (no leaked progress timer)', () => {
    const container = createContainer();
    const browser = createMapBrowser(container, { onPlayTour: vi.fn() });
    expect(browser).not.toBeNull();

    browser!.destroy();
    // destroy() clears the construction-time resize timer, so the baseline here
    // is zero pending timers.
    expect(vi.getTimerCount()).toBe(0);

    // A late progress callback (an in-flight indexing worker resolving after the
    // stream was aborted + the browser destroyed). With `done >= total` the
    // unguarded path would arm a NEW progress-hide setTimeout that destroy() has
    // already finished clearing — a leaked timer holding the detached DOM.
    browser!.setIndexingProgress(5, 5);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('runBackfill is a no-op after destroy (no leaked backfill timer)', async () => {
    let resolveBackfill: (result: BackfillResult) => void = () => {};
    const onBackfill = vi.fn(
      () =>
        new Promise<BackfillResult>((res) => {
          resolveBackfill = res;
        })
    );

    const container = createContainer();
    const browser = createMapBrowser(container, {
      onPlayTour: vi.fn(),
      onBackfill,
    });
    expect(browser).not.toBeNull();

    // Start the backfill (the click handler the CTA button is wired to). It runs
    // synchronously up to its `await options.onBackfill()` and then suspends.
    const backfillBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="map-browser-backfill"]'
    );
    expect(backfillBtn).not.toBeNull();
    backfillBtn!.click();
    expect(onBackfill).toHaveBeenCalledTimes(1);

    // The user closes the map while the backfill is in flight.
    browser!.destroy();
    expect(vi.getTimerCount()).toBe(0);

    // The in-flight backfill now resolves — onto a destroyed browser.
    resolveBackfill({
      embedded: 1,
      skipped: 0,
      failed: 0,
      permissionDenied: false,
    });
    await Promise.resolve();
    await Promise.resolve();

    // The unguarded continuation would arm a backfill-hide setTimeout that
    // destroy() can no longer clear.
    expect(vi.getTimerCount()).toBe(0);
  });
});
