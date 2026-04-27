'use strict';

/**
 * Local-core override hook for two-repo development.
 *
 * Default behavior: this hook is a no-op. `pnpm install` resolves
 * `gps-plus-slam-js` from the npm registry like any external consumer.
 *
 * When the LOCAL_CORE environment variable is set (any truthy value),
 * the hook rewrites every dependency on `gps-plus-slam-js` to a
 * `link:` symlink that points at the sibling private monorepo checkout
 * at `../gps-plus-slam/GpsPlusSlamJs`. This lets the maintainer iterate
 * on the closed-source core without publishing to npm between every
 * change.
 *
 * Usage (PowerShell):
 *   $env:LOCAL_CORE = '1'; pnpm install
 *   # ... edit + rebuild gps-plus-slam/GpsPlusSlamJs ...
 *   # changes are picked up automatically via the symlink
 *
 *   Remove-Item Env:LOCAL_CORE; pnpm install   # back to npm registry
 *
 * Documented in:
 *   GpsPlusSlamJs_Docs/docs/2026-03-30-separate-public-repo-plan.md §3.4 + §5.4 Recipe A
 *
 * Safety:
 *   - This file is committed but inert by default — CI and external
 *     contributors run plain `pnpm install` and never see the override.
 *   - The override only rewrites the version specifier; it does not
 *     modify any other field. If `gps-plus-slam-js` is not in a package's
 *     dependency lists, nothing is changed.
 */

const LOCAL_CORE_PATH = 'link:../../gps-plus-slam/GpsPlusSlamJs';
const PACKAGES_TO_REDIRECT = ['gps-plus-slam-js'];

function readPackage(pkg) {
  if (!process.env.LOCAL_CORE) {
    return pkg;
  }

  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[depField];
    if (!deps) continue;
    for (const name of PACKAGES_TO_REDIRECT) {
      if (Object.prototype.hasOwnProperty.call(deps, name)) {
        deps[name] = LOCAL_CORE_PATH;
      }
    }
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
