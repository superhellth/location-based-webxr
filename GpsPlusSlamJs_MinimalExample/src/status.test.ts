import { describe, expect, it } from 'vitest';
import { formatStatus, type ExampleStatusInput } from './status.js';

// Why this test matters: the minimal example reduces RecorderStore state to
// a one-line status panel. Keeping that derivation pure (no DOM, no store
// wiring) lets us pin its formatting deterministically without booting a
// real store, and prevents regressions when store fields are added/renamed.

describe('formatStatus', () => {
  const baseline: ExampleStatusInput = {
    isRecording: false,
    actionCount: 0,
    gpsPositionCount: 0,
    failedWriteCount: 0,
  };

  it('reports an idle store with zero data', () => {
    const status = formatStatus(baseline);
    expect(status).toContain('recording: no');
    expect(status).toContain('GPS fixes: 0');
    expect(status).toContain('actions: 0');
  });

  it('reports a live recording session with collected data', () => {
    const status = formatStatus({
      isRecording: true,
      actionCount: 42,
      gpsPositionCount: 7,
      failedWriteCount: 0,
    });
    expect(status).toContain('recording: yes');
    expect(status).toContain('GPS fixes: 7');
    expect(status).toContain('actions: 42');
  });

  it('surfaces failed writes only when non-zero so the line stays clean', () => {
    expect(formatStatus(baseline)).not.toContain('failed writes');

    const withFailures = formatStatus({ ...baseline, failedWriteCount: 3 });
    expect(withFailures).toContain('failed writes: 3');
  });

  it('rejects negative counts at the input boundary (defensive)', () => {
    // Counts come from store state, but a typo or stale fixture should
    // fail loudly rather than render "-1" on screen.
    expect(() =>
      formatStatus({ ...baseline, gpsPositionCount: -1 })
    ).toThrow();
  });
});
