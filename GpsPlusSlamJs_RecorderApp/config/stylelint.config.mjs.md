# Stylelint Configuration

## Purpose

Configures Stylelint to validate CSS files and inline `<style>` blocks in HTML files for syntax correctness. Primary goal is to catch LLM-generated "hallucinated" CSS properties (e.g., `color: 12px`).

## Public API

This config is used by the `lint:css` npm script:

```bash
npm run lint:css
```

## What Gets Linted

| Path           | Description                              |
| -------------- | ---------------------------------------- |
| `src/**/*.css` | Any CSS files in source                  |
| `**/*.html`    | All HTML files (inline `<style>` blocks) |

### Ignored Paths (Blacklist)

- `node_modules/`
- `dist/`
- `coverage/`
- `playwright-report/`
- `test-results/`

## Key Features

| Feature                    | Plugin                                         | What it catches                                    |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| **Standard conventions**   | `stylelint-config-standard`                    | Empty blocks, duplicate selectors, invalid nesting |
| **CSS syntax validation**  | `@carlosjeurissen/stylelint-csstree-validator` | Invalid property values per W3C specs              |
| **HTML `<style>` parsing** | `postcss-html`                                 | Extracts and lints CSS from HTML files             |

## Disabled Rules

Formatting rules are disabled since Prettier handles formatting:

- `rule-empty-line-before`
- `comment-empty-line-before`
- `declaration-empty-line-before`

## Example Errors Caught

```css
.example {
  color: 12px; /* ❌ Invalid value for "color" */
  width: red; /* ❌ Invalid value for "width" */
  font-size: 20px bold; /* ❌ Invalid value syntax */
}
```

## Tailwind Compatibility

The config allows Tailwind-specific at-rules:

- `@tailwind`
- `@apply`
- `@layer`
- `@config`

## Dependencies

- `stylelint@16` — Core linter (v16 for plugin compatibility)
- `stylelint-config-standard@36` — Baseline rules
- `@carlosjeurissen/stylelint-csstree-validator` — Syntax validation (maintained fork)
- `postcss-html` — Parses `<style>` blocks in HTML files

## Tests

No unit tests for config files. Validation is done via manual test:

```bash
# Create test file with invalid CSS
echo '.test { color: 12px; }' > src/test.css

# Run linter (should show error)
npm run lint:css

# Clean up
rm src/test.css
```

## Related Documentation

- [css-linting-best-practices.md](../docs/css-linting-best-practices.md) — Full rationale and plugin evaluation
