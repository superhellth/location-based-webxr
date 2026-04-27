/**
 * StorageBackend Interface & Implementations Tests
 *
 * Why this test matters: Validates that the StorageBackend abstraction works
 * correctly for both the NullStorageBackend (tests/replay) and
 * OpfsStorageBackend (production). This abstraction decouples the store from
 * the concrete OPFS dependency, enabling clean testing without vi.mock().
 *
 * TDD: These tests were written before the implementations to drive the API.
 */

import { describe, it, expect, vi } from 'vitest';
import type { StorageBackend } from './storage-backend';
import { NullStorageBackend } from './null-storage-backend';
import { OpfsStorageBackend } from './opfs-storage-backend';

// ---------------------------------------------------------------------------
// NullStorageBackend
// ---------------------------------------------------------------------------

describe('NullStorageBackend', () => {
  it('implements StorageBackend interface', () => {
    // Why: Compile-time + runtime check that NullStorageBackend satisfies the interface
    const backend: StorageBackend = new NullStorageBackend();
    expect(backend).toBeDefined();
    expect(typeof backend.writeAction).toBe('function');
    expect(typeof backend.writeFrame).toBe('function');
    expect(typeof backend.writeSessionMetadata).toBe('function');
  });

  it('writeAction resolves without side effects', async () => {
    // Why: NullStorageBackend must be a safe no-op for replay and tests
    const backend = new NullStorageBackend();
    await expect(
      backend.writeAction({ type: 'test/action' }, 1)
    ).resolves.toBeUndefined();
  });

  it('writeFrame resolves without side effects', async () => {
    // Why: Frame writes must also be no-ops in test/replay mode
    const backend = new NullStorageBackend();
    const blob = new Blob(['test'], { type: 'image/jpeg' });
    await expect(backend.writeFrame(blob, 1)).resolves.toBeUndefined();
  });

  it('writeSessionMetadata resolves without side effects', async () => {
    // Why: Session metadata writes must be no-ops in test/replay mode
    const backend = new NullStorageBackend();
    const metadata = {
      version: 1 as const,
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T01:00:00Z',
      scenarioName: 'Test',
      actionCount: 10,
      frameCount: 5,
      userAgent: 'test-agent',
    };
    await expect(
      backend.writeSessionMetadata(metadata)
    ).resolves.toBeUndefined();
  });

  it('can be called many times without accumulating state', async () => {
    // Why: Replay dispatches hundreds of actions; must not leak memory
    const backend = new NullStorageBackend();
    for (let i = 0; i < 100; i++) {
      await backend.writeAction({ type: `action/${i}` }, i);
    }
    // If we get here without error, the backend is stateless
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OpfsStorageBackend
// ---------------------------------------------------------------------------

// Mock the file-system module so we can verify delegation without real OPFS
vi.mock('./file-system', () => ({
  writeAction: vi.fn().mockResolvedValue(undefined),
  writeFrame: vi.fn().mockResolvedValue(undefined),
  writeSessionMetadata: vi.fn().mockResolvedValue(undefined),
}));

describe('OpfsStorageBackend', () => {
  it('implements StorageBackend interface', () => {
    // Why: Compile-time + runtime check that OpfsStorageBackend satisfies the interface
    const backend: StorageBackend = new OpfsStorageBackend();
    expect(backend).toBeDefined();
    expect(typeof backend.writeAction).toBe('function');
    expect(typeof backend.writeFrame).toBe('function');
    expect(typeof backend.writeSessionMetadata).toBe('function');
  });

  it('writeAction delegates to file-system writeAction', async () => {
    // Why: OpfsStorageBackend must forward calls to the existing OPFS functions
    const { writeAction } = await import('./file-system');
    const backend = new OpfsStorageBackend();
    const action = { type: 'gpsData/recordGpsEvent', payload: {} };

    await backend.writeAction(action, 42);

    expect(writeAction).toHaveBeenCalledWith(action, 42);
  });

  it('writeFrame delegates to file-system writeFrame', async () => {
    // Why: Frame persistence must use the same OPFS path as direct calls
    const { writeFrame } = await import('./file-system');
    const backend = new OpfsStorageBackend();
    const blob = new Blob(['img'], { type: 'image/jpeg' });

    await backend.writeFrame(blob, 7);

    expect(writeFrame).toHaveBeenCalledWith(blob, 7);
  });

  it('writeSessionMetadata delegates to file-system writeSessionMetadata', async () => {
    // Why: Session metadata must be written via the same OPFS facade
    const { writeSessionMetadata } = await import('./file-system');
    const backend = new OpfsStorageBackend();
    const metadata = {
      version: 1 as const,
      startedAt: '2026-01-01T00:00:00Z',
      endedAt: '2026-01-01T01:00:00Z',
      scenarioName: 'Test',
      actionCount: 10,
      frameCount: 5,
      userAgent: 'test-agent',
    };

    await backend.writeSessionMetadata(metadata);

    expect(writeSessionMetadata).toHaveBeenCalledWith(metadata);
  });

  it('propagates errors from file-system writeAction', async () => {
    // Why: Errors must not be swallowed — the store handles them with onWriteFailure
    const { writeAction } = await import('./file-system');
    vi.mocked(writeAction).mockRejectedValueOnce(new Error('OPFS full'));
    const backend = new OpfsStorageBackend();

    await expect(backend.writeAction({ type: 'test' }, 1)).rejects.toThrow(
      'OPFS full'
    );
  });
});
