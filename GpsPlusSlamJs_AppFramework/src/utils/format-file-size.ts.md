# format-file-size.ts

## Purpose

Formats byte counts into human-readable file size strings (B, KB, MB, GB).

## Public API

### `formatFileSize(bytes: number): string`

Converts a byte count to a display string.

- **Input**: `bytes` — non-negative integer
- **Output**: Formatted string like `"512 B"`, `"1.5 KB"`, `"23.4 MB"`, `"1.0 GB"`
- **Edge cases**: Negative or zero → `"0 B"`; bytes < 1024 → integer `"N B"`; otherwise one decimal

## Invariants & Assumptions

- Uses binary units (1 KB = 1024 bytes)
- Bytes shown as integers, all other units with one decimal place
- Maximum unit is GB (no TB)

## Examples

```ts
formatFileSize(0); // "0 B"
formatFileSize(512); // "512 B"
formatFileSize(1048576); // "1.0 MB"
formatFileSize(2_500_000_000); // "2.3 GB"
```

## Tests

- `format-file-size.test.ts` — unit tests covering 0, bytes, KB, MB, GB, negative
- Also sanity-tested via re-export in `session-summary.test.ts`
