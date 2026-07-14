/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: ["components", "store"],
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]*" } },
  },
  forbidden: [
    // One-way boundary: feature components may import the shared store contract,
    // but the store must never depend on a component.
    {
      name: "store-not-to-components",
      comment:
        "store/ is the shared contract (Component 3). It must not import from feature components — dependencies flow components → store only.",
      severity: "error",
      from: { path: "^store/" },
      to: { path: "^components/" },
    },

    // Catch typos in import paths (unresolvable specifiers)
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },

    // No circular dependencies (component dependency loops)
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
};
