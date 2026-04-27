// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Recorder App UI tests.
 *
 * These tests verify:
 * - Page loads without console errors
 * - Setup modal renders correctly
 * - UI elements are interactive (as much as possible without actual WebXR)
 */
const captureArtifacts = process.env.PLAYWRIGHT_CAPTURE === '1';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI
    ? [
        ['github'],
        ['json', { outputFile: '../test-results.json' }],
        ['junit', { outputFile: '../junit.xml' }],
      ]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: captureArtifacts ? 'on' : 'on-first-retry',
    screenshot: captureArtifacts ? 'on' : 'only-on-failure',
    video: captureArtifacts ? 'on' : 'retain-on-failure',
  },
  projects: [
    // Only test on Chromium since WebXR is Chrome-focused
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
