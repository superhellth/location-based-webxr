import { test, expect } from '@playwright/test';
import { waitForTestHooksSubset } from './test-helpers.js';

/**
 * Map-Centric Recording Browser E2E Tests (Step 4B)
 *
 * Why these tests matter:
 * The map browser is a Leaflet component, so its layout and interactions can't
 * be unit-tested (the repo covers Leaflet views with e2e). These tests assert
 * the D3a layout contract (full-bleed map + floating overlays — NOT a split or
 * a modal) and the core interactions: name search filters the tour list, a tile
 * selection narrows the list to that tile's tours, and picking a tour invokes
 * single-tour playback (D3). The pure tile/filter logic is unit-tested
 * separately in src/ui/map-browser-index.test.ts.
 *
 * The browser is mounted via the `mountMapBrowser` test hook with fixture tours
 * (GPS paths reduced to H3 coverage), so no real recordings folder is needed.
 */

// Two tours in the same area; one shares a point so they can co-occur on a tile.
const FIXTURE = [
  {
    filename: 'Paris-session-2026-03-01_09-00-00utc.zip',
    scenario: 'Paris',
    path: [
      { lat: 50.7495, lng: 6.4793 },
      { lat: 50.7475, lng: 6.4812 },
    ],
  },
  {
    filename: 'Tokyo-session-2026-03-02_09-00-00utc.zip',
    scenario: 'Tokyo',
    path: [
      { lat: 50.7475, lng: 6.4812 },
      { lat: 50.7451, lng: 6.4804 },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('#setup-modal').waitFor({ state: 'visible' });
  await waitForTestHooksSubset(page, () => window.testHooks?.mountMapBrowser);
  const ok = await page.evaluate(
    (fixture) => window.testHooks.mountMapBrowser(fixture),
    FIXTURE
  );
  expect(ok).toBe(true);
  await page.locator('[data-testid=map-browser]').waitFor({ state: 'visible' });
});

test.describe('Map-Centric Recording Browser', () => {
  test('renders a full-bleed map filling the viewport (not a split/modal)', async ({
    page,
  }) => {
    // Why: D3a requires the map to fill the whole window with overlays on top,
    // like a maps app — never a side-by-side column or a centered card.
    const viewport = page.viewportSize();
    const mapBox = await page
      .locator('[data-testid=map-browser-map]')
      .boundingBox();
    expect(mapBox).not.toBeNull();
    expect(Math.abs(mapBox.width - viewport.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(mapBox.height - viewport.height)).toBeLessThanOrEqual(2);

    // Leaflet initialised the full-bleed map element (it adds `leaflet-container`
    // to the element it mounts into).
    await expect(
      page.locator('[data-testid=map-browser-map].leaflet-container')
    ).toBeVisible();
  });

  test('overlays (search + tour list) float on top of the map', async ({
    page,
  }) => {
    await expect(
      page.locator('[data-testid=map-browser-search]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid=map-browser-tour-list]')
    ).toBeVisible();
    // Default list shows all tours (no tile selected yet).
    await expect(
      page.locator('[data-testid=map-browser-tour-item]')
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid=map-browser-list-header]')
    ).toContainText('All tours');
  });

  test('name search filters the tour list (case-insensitive substring)', async ({
    page,
  }) => {
    const search = page.locator('[data-testid=map-browser-search]');
    await search.fill('paris');
    await expect(
      page.locator('[data-testid=map-browser-tour-item]')
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid=map-browser-tour-item]')
    ).toContainText('Paris-session');

    await search.fill('');
    await expect(
      page.locator('[data-testid=map-browser-tour-item]')
    ).toHaveCount(2);
  });

  test('selecting a tile narrows the list to that tile’s tours', async ({
    page,
  }) => {
    const tiles = await page.evaluate(() =>
      window.__mapBrowserInstance.getRenderedTiles()
    );
    expect(tiles.length).toBeGreaterThan(0);

    await page.evaluate(
      (tile) => window.__mapBrowserInstance.selectTile(tile),
      tiles[0]
    );

    await expect(
      page.locator('[data-testid=map-browser-list-header]')
    ).toContainText('Tile');
    await expect(
      page.locator('[data-testid=map-browser-clear-tile]')
    ).toBeVisible();
    // At least one tour crosses any rendered tile.
    const count = await page
      .locator('[data-testid=map-browser-tour-item]')
      .count();
    expect(count).toBeGreaterThanOrEqual(1);

    // "Show all" clears the tile selection.
    await page.locator('[data-testid=map-browser-clear-tile]').click();
    await expect(
      page.locator('[data-testid=map-browser-list-header]')
    ).toContainText('All tours');
  });

  test('picking a tour triggers single-tour playback', async ({ page }) => {
    await page.locator('[data-testid=map-browser-tour-item]').first().click();
    const played = await page.evaluate(() => window.__mapBrowserPlayed);
    expect(played).toHaveLength(1);
    expect(played[0]).toContain('.zip');
  });

  test('close button tears down the browser', async ({ page }) => {
    await page.locator('[data-testid=map-browser-close]').click();
    await expect(page.locator('[data-testid=map-browser]')).toHaveCount(0);
  });
});
