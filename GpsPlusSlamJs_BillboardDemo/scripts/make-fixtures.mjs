// Generates the demo's placeholder fixtures into ./public:
//   - marker-{1,2,3}.png : distinct solid-colour tiles with a contrasting border
//   - clip-{1,2,3}.wav   : short mono sine tones (different pitch per clip)
//
// These are throwaway placeholders so the billboard demo has a real image to
// texture and a real audio clip to play (a real tour ships GLB/MP3/OGG). Run:
//   node scripts/make-fixtures.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(publicDir, { recursive: true });

// --- CRC32 (PNG chunk checksums) ---------------------------------------------
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size, fill, border) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // bytes 10..12 (compression/filter/interlace) stay 0

  const bw = Math.max(4, Math.round(size * 0.08)); // border width
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const edge = x < bw || x >= size - bw || y < bw || y >= size - bw;
      const [r, g, b] = edge ? border : fill;
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeWav(freq, seconds) {
  const rate = 22050; // half-rate keeps the placeholder clips small
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    // Gentle fade in/out to avoid clicks; modest amplitude.
    const fade = Math.min(1, i / 2000, (n - i) / 2000);
    const sample = Math.sin((2 * Math.PI * freq * i) / rate) * 0.3 * fade;
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const markers = [
  { fill: [0xc6, 0x4a, 0x4a], border: [0xff, 0xe2, 0x9a] },
  { fill: [0x3f, 0x9a, 0x5a], border: [0xe2, 0xff, 0x9a] },
  { fill: [0x3f, 0x6a, 0xc6], border: [0x9a, 0xe2, 0xff] },
];
const freqs = [330, 440, 550];

markers.forEach((m, i) => {
  writeFileSync(join(publicDir, `marker-${i + 1}.png`), makePng(128, m.fill, m.border));
});
freqs.forEach((f, i) => {
  writeFileSync(join(publicDir, `clip-${i + 1}.wav`), makeWav(f, 3 + i));
});

console.log(`Wrote 3 marker PNGs + 3 clip WAVs to ${publicDir}`);
