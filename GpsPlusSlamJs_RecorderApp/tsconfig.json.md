# `tsconfig.json` — Main TypeScript Configuration

## Purpose

The primary TypeScript configuration for the recorder app source code. This config targets modern browsers (ES2022) and uses bundler-style module resolution for Vite compatibility.

## Key Compiler Options

| Option | Value | Rationale |
|--------|-------|-----------|
| `target` | `ES2022` | Modern JS features (top-level await, etc.) |
| `module` | `ES2022` | Native ESM output |
| `moduleResolution` | `bundler` | Vite/esbuild-aware resolution |
| `types` | `["vite/client"]` | Enables Vite's `import.meta.env` types |
| `strict` | `true` | Full type safety |
| `noEmit` | `true` | Vite handles transpilation; tsc is for type-checking only |
| `isolatedModules` | `true` | Ensures compatibility with esbuild/SWC |
| `skipLibCheck` | `true` | Faster builds by skipping `.d.ts` validation |

## Path Aliases

| Alias | Maps To | Usage |
|-------|---------|-------|
| `@app/*` | `src/*` | Internal app imports |
| `gps-plus-slam-js` | `../GpsPlusSlamJs/src/index.ts` | Resolves the npm package name to library **source** instead of `dist/index.d.ts`, ensuring tsc always type-checks against the real (readonly) types rather than potentially stale build output |

## Scope

- **Includes**: All `.ts` files in `src/`
- **Excludes**: `dist/`, `node_modules/`, test files (`*.test.ts`, `*.spec.ts`)

## Invariants

- Tests are excluded to avoid polluting production type-checking with test-only types.
- Use `tsconfig.vitest.json` for test file type-checking.
- Use `tsconfig.eslint.json` for ESLint's type-aware rules (broader scope).

## Usage

```bash
# Type-check source files
npm run typecheck
# or directly
npx tsc -p tsconfig.json --noEmit
```

## Related Files

- `tsconfig.vitest.json.md` — Test file type-checking config
- `tsconfig.eslint.json.md` — ESLint type-aware config
- `config/vite.config.ts.md` — Vite build config
