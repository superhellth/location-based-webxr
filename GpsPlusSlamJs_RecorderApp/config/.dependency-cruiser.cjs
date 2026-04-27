/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: 'src',
    exclude: { path: '((^|\\/)playwright-report/)' },
    reporterOptions: { dot: { collapsePattern: 'node_modules/[^/]*' } },
  },
  forbidden: [
    // Catch typos in import paths (unresolvable specifiers)
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },

    // No circular dependencies
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },

    // Enforce layered architecture: storage/sensors can't import from ui
    {
      name: 'no-storage-importing-ui',
      severity: 'error',
      from: { path: '^src/storage' },
      to: { path: '^src/ui' },
    },
    {
      name: 'no-sensors-importing-ui',
      severity: 'error',
      from: { path: '^src/sensors' },
      to: { path: '^src/ui' },
    },

    // State should not import from ar or ui directly
    {
      name: 'no-state-importing-ar',
      severity: 'error',
      from: { path: '^src/state' },
      to: { path: '^src/ar' },
    },
    {
      name: 'no-state-importing-ui',
      severity: 'error',
      from: { path: '^src/state' },
      to: { path: '^src/ui' },
    },
  ],
};
