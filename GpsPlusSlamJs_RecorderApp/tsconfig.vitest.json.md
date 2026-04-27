# `tsconfig.vitest.json` — Test File Type Configuration

## Purpose

TypeScript configuration specifically for type-checking test files with Vitest globals and Node.js types. Separated from the main config to keep test-specific types out of production builds.

## Key Differences from `tsconfig.json`

| Option | Value | Rationale |
|--------|-------|-----------|
| `types` | `["vitest/globals", "node", "vite/client"]` | Enables Vitest globals (`describe`, `it`, `expect`), Node.js types, and Vite's `import.meta.env` types |
| `checkJs` | `true` | Also type-check JavaScript config files |

## Scope

- **Includes**: All `.ts` files in `src/` (including test files)
- **Excludes**: `dist/`, `coverage/`, `node_modules/`

## Path Aliases

| Alias | Maps To |
|-------|---------|
| `@app/*` | `src/*` |
| `gps-plus-slam-js` | `../GpsPlusSlamJs/src/index.ts` |

The `gps-plus-slam-js` alias resolves the npm package name to library source, matching the main tsconfig. This ensures test mocks and type assertions stay in sync with the real library types (e.g., `readonly` tuple modifiers).

## Invariants

- Must include `vitest/globals` in types for global test functions.
- Runs separately from main typecheck via `npm run typecheck:tests`.
- Test files should follow `*.test.ts` naming convention.

## Usage

```bash
# Type-check test files
npm run typecheck:tests
# or directly
npx tsc -p tsconfig.vitest.json --noEmit
```

## Related Files

- `tsconfig.json.md` — Main source type-checking config
- `config/vitest.config.ts.md` — Vitest test runner config
