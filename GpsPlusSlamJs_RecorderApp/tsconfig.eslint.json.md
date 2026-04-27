# `tsconfig.eslint.json` — ESLint Type-Aware Configuration

## Purpose

Extended TypeScript configuration for ESLint's type-aware rules. This config has the broadest scope—including source, config, and test files—so ESLint can apply type-based rules across the entire codebase.

## Key Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| `extends` | `./tsconfig.json` | Inherits all settings from main config |
| `noEmit` | `true` | Type-checking only, no output |
| `include` | `["src/**/*", "config/**/*", "playwright-tests/**/*"]` | All code files |
| `exclude` | `[]` | Nothing excluded (maximum coverage) |

## Why a Separate Config?

ESLint's type-aware rules (e.g., `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-unsafe-*`) require access to TypeScript's type information. This config:

1. **Extends main config**: Inherits compiler options for consistency.
2. **Broader scope**: Includes config files and test files that the main config excludes.
3. **Referenced by ESLint**: `eslint.config.mjs` points to this file via `parserOptions.project`.

## Invariants

- Must be kept in sync with `tsconfig.json` base options.
- ESLint's `parserOptions.project` must point to this file.
- Should include all files that ESLint lints.

## Usage

This config is not invoked directly. It's used automatically by ESLint:

```bash
# ESLint uses this config internally
npm run lint
```

## Related Files

- `tsconfig.json.md` — Base TypeScript config
- `config/eslint.config.mjs.md` — ESLint configuration
