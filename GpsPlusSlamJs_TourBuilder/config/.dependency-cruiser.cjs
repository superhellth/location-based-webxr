/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    doNotFollow: { path: "node_modules" },
    // `three` itself is included (but never followed, see doNotFollow) so the
    // ar-scene runtime boundary rule below has an edge to match on — with a
    // components/store-only graph, external imports simply vanish and the rule
    // could never fire.
    includeOnly: ["^components", "^store", "node_modules/three/"],
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]*" } },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
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

    // Component 8's three-layer split (plan A20): `runtime/` orchestrates the
    // scene but must stay renderable-agnostic, talking only to the SceneAdapter
    // port. A runtime import of `three` would defeat the whole reason the port
    // exists — the replay e2e drives `runtime/` in Node with no WebGL. Type-only
    // imports are allowed (they carry no runtime dependency; component 4's pure
    // core does the same for `Vector3`).
    {
      name: "ar-scene-runtime-not-to-three",
      comment:
        "components/ar-scene/runtime must not depend on three at runtime — render through the SceneAdapter port instead (plan A20).",
      severity: "error",
      from: {
        path: "^components/ar-scene/runtime/",
        // Tests and the fake adapter STAND IN for the view layer, so they are
        // allowed to build real THREE objects (positions, matrices).
        pathNot: "\\.test\\.ts$|fake-scene-adapter\\.ts$",
      },
      to: { path: "node_modules/three", dependencyTypesNot: ["type-only"] },
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
