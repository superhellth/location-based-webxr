# status.ts

## Purpose

Pure formatter for the minimal example's status panel: takes a small
plain shape derived from the `RecorderStore` state and returns a
multi-line string for `<pre id="status">`.

## Public API

```ts
interface ExampleStatusInput {
  readonly isRecording: boolean;
  readonly actionCount: number;       // >= 0
  readonly gpsPositionCount: number;  // >= 0
  readonly failedWriteCount: number;  // >= 0
}

formatStatus(input: ExampleStatusInput): string;
```

## Invariants & assumptions

- The function is fully pure: no DOM, no clock, no module state.
- All count fields are validated as **finite, non-negative numbers**;
  a violation throws — failing loudly is preferred to rendering "-1".
- `failedWriteCount: 0` is suppressed from the output so the common
  happy-path stays clean.

## Examples

```ts
formatStatus({
  isRecording: false,
  actionCount: 0,
  gpsPositionCount: 0,
  failedWriteCount: 0,
});
// "recording: no\nGPS fixes: 0\nactions: 0"
```

## Tests

[status.test.ts](status.test.ts) covers idle, active, suppressed-failure,
and the negative-input boundary case.
