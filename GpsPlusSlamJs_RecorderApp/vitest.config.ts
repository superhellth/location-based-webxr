/**
 * Root-level vitest config.
 *
 * Re-exports the canonical config from config/vitest.config.ts so that
 * bare `npx vitest run` (without an explicit --config flag) still uses
 * the correct include/exclude patterns and doesn't accidentally pick up
 * Playwright spec files from playwright-tests/.
 */
export { default } from './config/vitest.config';
