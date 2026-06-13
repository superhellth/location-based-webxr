/**
 * Tests for `createZipFrameBlobSource` — F3.5a.
 */

import { describe, expect, it } from 'vitest';
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
} from '@zip.js/zip.js';

import { createZipFrameBlobSource } from './zip-frame-blob-source';

async function buildZip(
  files: Array<{ readonly name: string; readonly bytes: Uint8Array }>
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  for (const f of files) {
    await zipWriter.add(f.name, new Uint8ArrayReader(f.bytes));
  }
  // Make sure async ops on @zip.js Writers settle.
  await Promise.resolve();
  return zipWriter.close();
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('createZipFrameBlobSource', () => {
  // Why: replay's blob source must return the actual JPEG bytes for the
  // imageFile path the slice carries so the visualizer can decode them.
  it('returns a Blob with the entry bytes for a known frame path', async () => {
    const zip = await buildZip([
      { name: 'frames/frame-000001.jpg', bytes: bytes('fake-jpeg-bytes') },
      { name: 'actions/000001.json', bytes: bytes('{}') },
    ]);

    const source = await createZipFrameBlobSource(zip);
    const blob = await source('frames/frame-000001.jpg');

    expect(blob).not.toBeNull();
    if (!blob) return;
    const text = await blob.text();
    expect(text).toBe('fake-jpeg-bytes');
  });

  // Why: a missing frame must surface as `null` so the wirer's
  // `if (!blob) return` branch fires instead of throwing.
  it('returns null for an unknown frame path', async () => {
    const zip = await buildZip([
      { name: 'frames/frame-000001.jpg', bytes: bytes('a') },
    ]);
    const source = await createZipFrameBlobSource(zip);
    const blob = await source('frames/missing.jpg');
    expect(blob).toBeNull();
  });

  // Why: callers may invoke the source many times (one per add2dImage).
  // The reader must remain usable across invocations.
  it('supports multiple sequential lookups', async () => {
    const zip = await buildZip([
      { name: 'frames/a.jpg', bytes: bytes('AAA') },
      { name: 'frames/b.jpg', bytes: bytes('BBBB') },
    ]);
    const source = await createZipFrameBlobSource(zip);

    const a = await source('frames/a.jpg');
    const b = await source('frames/b.jpg');
    const a2 = await source('frames/a.jpg');

    expect(await a?.text()).toBe('AAA');
    expect(await b?.text()).toBe('BBBB');
    expect(await a2?.text()).toBe('AAA');
  });

  // Why (Q5 rename): NEW recordings store images under `images/` and persist
  // `imageFile: images/…`. A direct lookup by the stored path must resolve.
  it('resolves new-layout images/ entries by their stored path', async () => {
    const zip = await buildZip([
      { name: 'images/frame-000001.jpg', bytes: bytes('new-jpeg') },
    ]);
    const source = await createZipFrameBlobSource(zip);
    const blob = await source('images/frame-000001.jpg');
    expect(await blob?.text()).toBe('new-jpeg');
  });

  // Why (Q5 safety net): if a ZIP's stored `imageFile` prefix disagrees with
  // its entry prefix (e.g. a hand-merged/migrated ZIP), the source falls back
  // to the swapped frames/↔images/ prefix so the frame still resolves.
  it('falls back across the frames/↔images/ prefix on mismatch', async () => {
    // Entry stored under legacy frames/, looked up with the new images/ prefix.
    const legacyZip = await buildZip([
      { name: 'frames/frame-000001.jpg', bytes: bytes('legacy') },
    ]);
    const legacySource = await createZipFrameBlobSource(legacyZip);
    expect(await (await legacySource('images/frame-000001.jpg'))?.text()).toBe(
      'legacy'
    );

    // Entry stored under new images/, looked up with the legacy frames/ prefix.
    const newZip = await buildZip([
      { name: 'images/frame-000001.jpg', bytes: bytes('fresh') },
    ]);
    const newSource = await createZipFrameBlobSource(newZip);
    expect(await (await newSource('frames/frame-000001.jpg'))?.text()).toBe(
      'fresh'
    );
  });
});

// Surface that we actually depend on `TextReader` import path correctness.
void TextReader;
