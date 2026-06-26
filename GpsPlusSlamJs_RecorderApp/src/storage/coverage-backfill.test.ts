/**
 * Tests for the one-time coverage backfill (B2 + B4 — in-zip rewrite).
 *
 * Why this matters: the backfill mutates the user's recording files, so its
 * contract must be airtight:
 *   - it requires an explicit readwrite permission upgrade and degrades (no
 *     writes) if denied;
 *   - it verifies each rewrite in memory BEFORE overwriting (never writes a zip
 *     whose session.json didn't actually gain coverage);
 *   - a single failing file is isolated and counted, the rest still process;
 *   - an already-aborted run touches nothing (no permission prompt, no writes).
 *
 * Uses purpose-built fake file handles (the repo pattern for precise FS-Access
 * cases) since the shared MockFSFileHandle.createWritable stores strings, not
 * the Blob the backfill writes.
 *
 * @see ./coverage-backfill.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { produceTestZip } from 'gps-plus-slam-app-framework/test-utils/zip-round-trip-helpers';
import { loadSessionMetadataFromBlob } from 'gps-plus-slam-app-framework/storage/zip-reader';
import {
  backfillCoverageIntoZips,
  type BackfillCandidate,
} from './coverage-backfill';

const CELLS = ['8b1fa1da1d64fff', '8b1fa1da1d4afff'];

/** A file handle backed by an in-memory Blob, capturing writes. */
class FakeFileHandle {
  kind = 'file' as const;
  name: string;
  blob: Blob;
  failGetFile = false;
  failCreateWritable = false;
  failWrite = false;
  writeCount = 0;
  aborted = false;

  constructor(name: string, blob: Blob) {
    this.name = name;
    this.blob = blob;
  }

  getFile(): Promise<File> {
    if (this.failGetFile) {
      return Promise.reject(new Error('getFile failed'));
    }
    return Promise.resolve(
      new File([this.blob], this.name, { type: 'application/zip' })
    );
  }

  createWritable(): Promise<FileSystemWritableFileStream> {
    if (this.failCreateWritable) {
      return Promise.reject(new Error('createWritable failed'));
    }
    const stream = {
      write: (data: unknown) => {
        // A failed write must NOT touch `blob`: in the real FS-Access API the
        // write lands in a temp swap file, so the original stays intact until
        // close() atomically swaps it in.
        if (this.failWrite) {
          return Promise.reject(new Error('write failed'));
        }
        this.blob = data as Blob;
        return Promise.resolve();
      },
      close: () => {
        this.writeCount += 1;
        return Promise.resolve();
      },
      abort: () => {
        this.aborted = true;
        return Promise.resolve();
      },
    } as unknown as FileSystemWritableFileStream;
    return Promise.resolve(stream);
  }
}

function asHandle(fake: FakeFileHandle): FileSystemFileHandle {
  return fake as unknown as FileSystemFileHandle;
}

/** A directory handle whose requestPermission returns a fixed state. */
function fakeRoot(permission: PermissionState): {
  handle: FileSystemDirectoryHandle;
  requestPermission: ReturnType<typeof vi.fn>;
} {
  const requestPermission = vi.fn(() => Promise.resolve(permission));
  const handle = {
    kind: 'directory',
    name: 'Recordings',
    requestPermission,
  } as unknown as FileSystemDirectoryHandle;
  return { handle, requestPermission };
}

async function legacyZipBlob(scenario: string): Promise<Blob> {
  const { zipData } = await produceTestZip({ scenarioName: scenario }); // no h3Cells
  return new Blob([zipData as BlobPart]);
}

async function zipWithoutSession(): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0 });
  await writer.add('actions/000001.json', new TextReader('{"type":"x"}'));
  return writer.close();
}

function candidate(
  fake: FakeFileHandle,
  cells: readonly string[] = CELLS
): BackfillCandidate {
  return { fileHandle: asHandle(fake), filename: fake.name, cells };
}

describe('backfillCoverageIntoZips', () => {
  it('embeds coverage into each legacy recording and reports progress', async () => {
    const h1 = new FakeFileHandle('a.zip', await legacyZipBlob('A'));
    const h2 = new FakeFileHandle('b.zip', await legacyZipBlob('B'));
    const { handle } = fakeRoot('granted');
    const progress: number[] = [];

    const result = await backfillCoverageIntoZips(
      handle,
      [candidate(h1), candidate(h2)],
      { onProgress: (p) => progress.push(p.done) }
    );

    expect(result).toMatchObject({
      embedded: 2,
      failed: 0,
      permissionDenied: false,
    });
    expect(h1.writeCount).toBe(1);
    expect(h2.writeCount).toBe(1);
    // The rewritten blobs now carry coverage.
    expect((await loadSessionMetadataFromBlob(h1.blob))?.h3Cells).toEqual(
      CELLS
    );
    expect((await loadSessionMetadataFromBlob(h2.blob))?.h3Cells).toEqual(
      CELLS
    );
    expect(progress.at(-1)).toBe(2);
  });

  it('writes nothing and reports permissionDenied when readwrite is refused', async () => {
    const h1 = new FakeFileHandle('a.zip', await legacyZipBlob('A'));
    const { handle, requestPermission } = fakeRoot('denied');

    const result = await backfillCoverageIntoZips(handle, [candidate(h1)]);

    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(result.permissionDenied).toBe(true);
    expect(result.embedded).toBe(0);
    expect(h1.writeCount).toBe(0);
    expect(
      (await loadSessionMetadataFromBlob(h1.blob))?.h3Cells
    ).toBeUndefined();
  });

  it('isolates a per-file failure and still processes the rest', async () => {
    const bad = new FakeFileHandle('bad.zip', await legacyZipBlob('Bad'));
    bad.failCreateWritable = true;
    const good = new FakeFileHandle('good.zip', await legacyZipBlob('Good'));
    const { handle } = fakeRoot('granted');

    const result = await backfillCoverageIntoZips(handle, [
      candidate(bad),
      candidate(good),
    ]);

    expect(result.failed).toBe(1);
    expect(result.embedded).toBe(1);
    expect((await loadSessionMetadataFromBlob(good.blob))?.h3Cells).toEqual(
      CELLS
    );
  });

  it('aborts the writable (no partial commit) when write() fails mid-rewrite', async () => {
    // Why: createWritable() writes to a temp swap file that close() atomically
    // swaps over the original. If write() throws, calling close() in cleanup
    // would commit the partial/empty temp — corrupting the user's recording.
    // The stream must instead be abort()ed: that discards the temp (original
    // untouched) AND finalizes the stream so the file handle/lock is not leaked.
    const h = new FakeFileHandle('a.zip', await legacyZipBlob('A'));
    const original = h.blob;
    h.failWrite = true;
    const { handle } = fakeRoot('granted');

    const result = await backfillCoverageIntoZips(handle, [candidate(h)]);

    expect(result.failed).toBe(1);
    expect(result.embedded).toBe(0);
    // close() must NOT run — it would atomically swap the partial temp in.
    expect(h.writeCount).toBe(0);
    // abort() MUST run — otherwise the stream/lock is leaked.
    expect(h.aborted).toBe(true);
    // The original file is left byte-for-byte intact (no coverage embedded).
    expect(h.blob).toBe(original);
    expect(
      (await loadSessionMetadataFromBlob(h.blob))?.h3Cells
    ).toBeUndefined();
  });

  it('skips (no write) a zip without session.json', async () => {
    const h = new FakeFileHandle('nosess.zip', await zipWithoutSession());
    const { handle } = fakeRoot('granted');

    const result = await backfillCoverageIntoZips(handle, [candidate(h)]);

    expect(result.skipped).toBe(1);
    expect(result.embedded).toBe(0);
    expect(h.writeCount).toBe(0);
  });

  it('does nothing (no permission prompt, no writes) when already aborted', async () => {
    const h = new FakeFileHandle('a.zip', await legacyZipBlob('A'));
    const { handle, requestPermission } = fakeRoot('granted');
    const controller = new AbortController();
    controller.abort();

    const result = await backfillCoverageIntoZips(handle, [candidate(h)], {
      signal: controller.signal,
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(h.writeCount).toBe(0);
    expect(result.embedded).toBe(0);
  });
});
