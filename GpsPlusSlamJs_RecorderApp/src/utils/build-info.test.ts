/**
 * Build Info Tests
 *
 * Why this test matters:
 * Validates that getBuildInfo() correctly reads the Vite-injected build-time
 * constants and returns a well-typed BuildInfo object. Since the real globals
 * are replaced at build time by Vite's `define`, tests must set up globals
 * manually to simulate the injection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BuildInfo } from './build-info';

// The module reads globals at call time, so we can set them before importing.
// We use dynamic import to ensure each test gets fresh globals.

describe('getBuildInfo', () => {
  const FAKE_COMMIT = 'abc1234';
  const FAKE_TIME = '2026-04-20T12:00:00.000Z';
  const FAKE_APP_VERSION = '0.1.0';
  const FAKE_LIB_VERSION = '1.0.0';
  const FAKE_FW_VERSION = '0.1.0';

  beforeEach(() => {
    // Simulate Vite define replacements by setting globals
    vi.stubGlobal('__BUILD_COMMIT__', FAKE_COMMIT);
    vi.stubGlobal('__BUILD_TIME__', FAKE_TIME);
    vi.stubGlobal('__APP_VERSION__', FAKE_APP_VERSION);
    vi.stubGlobal('__LIB_VERSION__', FAKE_LIB_VERSION);
    vi.stubGlobal('__FW_VERSION__', FAKE_FW_VERSION);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns all build fields from injected globals', async () => {
    const { getBuildInfo } = await import('./build-info');
    const info: BuildInfo = getBuildInfo();

    expect(info).toEqual({
      commitHash: FAKE_COMMIT,
      appVersion: FAKE_APP_VERSION,
      libraryVersion: FAKE_LIB_VERSION,
      frameworkVersion: FAKE_FW_VERSION,
      buildTime: FAKE_TIME,
    });
  });

  it('returns string values for all fields', async () => {
    const { getBuildInfo } = await import('./build-info');
    const info = getBuildInfo();

    for (const [, value] of Object.entries(info)) {
      expect(typeof value).toBe('string');
    }
  });

  it('returns exactly five fields', async () => {
    const { getBuildInfo } = await import('./build-info');
    const info = getBuildInfo();

    expect(Object.keys(info)).toHaveLength(5);
  });

  it('throws when required metadata is missing', async () => {
    // Why this test matters:
    // Missing metadata should fail loudly at the helper boundary so callers
    // can decide whether to surface a warning or degrade gracefully.
    vi.unstubAllGlobals();

    const { getBuildInfo } = await import('./build-info');

    expect(() => getBuildInfo()).toThrow(
      'Missing or invalid build metadata: __BUILD_COMMIT__'
    );
  });
});
