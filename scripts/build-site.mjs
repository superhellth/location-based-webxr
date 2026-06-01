#!/usr/bin/env node
// @ts-check
/**
 * build-site.mjs — orchestrates the multi-app subpath deployment.
 *
 * Builds the framework once, then builds the RecorderApp under base `/recorder/`
 * and the AnchorStarter under base `/starter/` into a single combined output
 * directory (`dist-site/`), and copies the static landing page to the root.
 * The resulting tree is what Cloudflare serves from `gps.csutil.com`:
 *
 *   dist-site/
 *     index.html        ← landing page (root)
 *     recorder/         ← RecorderApp, base=/recorder/
 *     starter/          ← AnchorStarter, base=/starter/
 *
 * `base` and `outDir` are passed as build-time CLI flags so the committed app
 * vite configs stay at their `/` + `dist` defaults (dev/USB-debugging unchanged).
 *
 * After each app build it asserts the emitted HTML contains no root-absolute
 * (`/...`) URL outside the app's own base — this is the executable guard for
 * plan Steps 1-3 (so a future runtime-absolute URL that Vite cannot rewrite
 * fails the deploy instead of 404-ing in production).
 *
 * See: GpsPlusSlamJs_Docs/docs/2026-06-01-multi-app-subpath-deployment-plan.md
 */

import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distSite = join(repoRoot, 'dist-site');

/** Run a command, inheriting stdio, from the repo root. Throws on non-zero. */
function run(cmd, args) {
  execFileSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    // pnpm resolves to pnpm.cmd on Windows; a shell makes that lookup work.
    shell: process.platform === 'win32',
  });
}

/**
 * Assert that every root-absolute `href`/`src` in the built HTML begins with
 * the expected base. Vite rewrites root-absolute URLs in processed `index.html`
 * to be base-prefixed; anything still pointing at bare `/...` would 404 once the
 * app is mounted under a subpath. Data URIs and external (`http(s)://`,
 * protocol-relative `//`) URLs are ignored.
 *
 * @param {string} htmlPath absolute path to a built HTML file
 * @param {string} base expected base prefix, e.g. '/recorder/'
 */
function assertNoBareAbsoluteUrls(htmlPath, base) {
  const html = readFileSync(htmlPath, 'utf-8');
  const attrRe = /(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const violations = [];
  let match;
  while ((match = attrRe.exec(html)) !== null) {
    const url = match[1] ?? match[2] ?? '';
    // Only root-absolute, single-slash URLs are deployment paths. Skip
    // protocol-relative (`//cdn`) and external/data URLs.
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    if (!url.startsWith(base)) violations.push(url);
  }
  if (violations.length > 0) {
    throw new Error(
      `Built HTML ${htmlPath} contains root-absolute URL(s) not under base ` +
        `${base}: ${[...new Set(violations)].join(', ')}. Make them ` +
        `base-relative (drop the leading '/') or use import.meta.env.BASE_URL.`
    );
  }
}

/** Assert the combined deploy tree matches the documented target layout. */
function assertSiteTree() {
  const required = [
    'index.html',
    'recorder/index.html',
    'recorder/ar-hittest-test.html',
    'starter/index.html',
  ];
  const missing = required.filter((rel) => !existsSync(join(distSite, rel)));
  if (missing.length > 0) {
    throw new Error(
      `dist-site is missing required file(s): ${missing.join(', ')}`
    );
  }
}

console.log('• Cleaning dist-site/');
rmSync(distSite, { recursive: true, force: true });
mkdirSync(distSite, { recursive: true });

console.log('• Building framework (once)');
run('pnpm', ['run', 'build:framework']);

console.log('• Building RecorderApp (base=/recorder/)');
run('pnpm', ['--filter', 'gps-plus-slam-recorder', 'run', 'typecheck']);
run('pnpm', [
  '--filter',
  'gps-plus-slam-recorder',
  'exec',
  'vite',
  'build',
  '--config',
  'config/vite.config.ts',
  '--base=/recorder/',
  '--outDir',
  join(distSite, 'recorder'),
  '--emptyOutDir',
]);
assertNoBareAbsoluteUrls(join(distSite, 'recorder', 'index.html'), '/recorder/');

console.log('• Building AnchorStarter (base=/starter/)');
run('pnpm', ['--filter', 'gps-plus-slam-anchor-starter', 'run', 'typecheck']);
run('pnpm', [
  '--filter',
  'gps-plus-slam-anchor-starter',
  'exec',
  'vite',
  'build',
  '--base=/starter/',
  '--outDir',
  join(distSite, 'starter'),
  '--emptyOutDir',
]);
assertNoBareAbsoluteUrls(join(distSite, 'starter', 'index.html'), '/starter/');

console.log('• Copying landing page to dist-site/index.html');
cpSync(
  join(repoRoot, 'GpsPlusSlamJs_Landing', 'index.html'),
  join(distSite, 'index.html')
);

assertSiteTree();
console.log('✓ dist-site/ built and verified');
