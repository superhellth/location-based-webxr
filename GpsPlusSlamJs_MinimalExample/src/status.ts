/**
 * Pure formatter for the minimal example's status panel.
 *
 * Intentionally framework-free: takes a plain shape derived from the
 * RecorderStore state instead of importing store types directly. This
 * keeps the helper testable without booting a Redux store and decouples
 * the example's UI from internal AppFramework type churn.
 */

export interface ExampleStatusInput {
  readonly isRecording: boolean;
  readonly actionCount: number;
  readonly gpsPositionCount: number;
  readonly failedWriteCount: number;
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number, got ${value}`);
  }
}

export function formatStatus(input: ExampleStatusInput): string {
  assertNonNegative('actionCount', input.actionCount);
  assertNonNegative('gpsPositionCount', input.gpsPositionCount);
  assertNonNegative('failedWriteCount', input.failedWriteCount);

  const lines = [
    `recording: ${input.isRecording ? 'yes' : 'no'}`,
    `GPS fixes: ${input.gpsPositionCount}`,
    `actions: ${input.actionCount}`,
  ];
  if (input.failedWriteCount > 0) {
    lines.push(`failed writes: ${input.failedWriteCount}`);
  }
  return lines.join('\n');
}
