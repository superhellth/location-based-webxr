# eslint.config.mjs

## Purpose

ESLint flat config for TypeScript linting with type-aware rules and Vitest support.

## Features

- **Type-aware linting** via `tsconfig.eslint.json`
- **Vitest plugin** for test-specific rules
- **Complexity warnings** - `complexity: 10`, `max-depth: 4`
- **Unused variable pattern** - Underscore-prefixed allowed (`_unused`)

## Configuration Blocks

1. **Base** - ESLint recommended rules
2. **Shared defaults** - Browser/Node globals, security rules
3. **Vitest overrides** - Test file patterns with Vitest globals
4. **TypeScript overrides** - Type-checked rules for `.ts` files
5. **JavaScript overrides** - Unused var pattern for `.js` files
6. **Ignores** - dist, coverage, node_modules, etc.

## Usage

```bash
npm run lint
```

## Differences from Library

Identical to `GpsPlusSlamJs/config/eslint.config.mjs` except:

- No mutation testing paths in ignores
- Points to local `tsconfig.eslint.json`
