// Generates component 8's demo fixtures into ./public/ar-scene:
//   - knight.glb  : a minimal, hand-written glTF binary (one indexed box mesh),
//                   so the demo exercises the REAL GLTFLoader parse path
//   - banner.png  : a solid-colour sprite tile with a contrasting border
//   - story.wav   : a short mono tone standing in for the narration
//
// Same throwaway-placeholder idea as scripts/make-fixtures.mjs (component 1) —
// a real tour ships proper GLB/MP3 assets. Generated rather than sourced so the
// repo carries no third-party binaries. Run:
//   node scripts/make-ar-scene-fixtures.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "ar-scene",
);
mkdirSync(outDir, { recursive: true });

// ── PNG ──────────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePng(path, size, fill, border) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const edge = x < 4 || y < 4 || x >= size - 4 || y >= size - 4;
      const [r, g, b] = edge ? border : fill;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

// ── WAV ──────────────────────────────────────────────────────────────────────
function writeWav(path, seconds, frequency) {
  const rate = 22050;
  const frames = Math.floor(rate * seconds);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const fade = Math.min(1, Math.min(i, frames - i) / (rate * 0.05));
    const sample = Math.sin((2 * Math.PI * frequency * i) / rate) * 0.3 * fade;
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

// ── GLB ──────────────────────────────────────────────────────────────────────
// A hand-written glTF 2.0 binary: one indexed box standing on the ground plane,
// which is enough to drive GLTFLoader.parse for real in the demo.
function writeGlb(path, { width, height, depth, colour }) {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = new Float32Array([
    -hw, 0, -hd, hw, 0, -hd, hw, height, -hd, -hw, height, -hd, // back face
    -hw, 0, hd, hw, 0, hd, hw, height, hd, -hw, height, hd, // front face
  ]);
  const indices = new Uint16Array([
    4, 5, 6, 4, 6, 7, // front
    1, 0, 3, 1, 3, 2, // back
    0, 4, 7, 0, 7, 3, // left
    5, 1, 2, 5, 2, 6, // right
    3, 7, 6, 3, 6, 2, // top
    0, 1, 5, 0, 5, 4, // bottom
  ]);

  const positionBytes = Buffer.from(positions.buffer);
  const indexBytes = Buffer.from(indices.buffer);
  const indexOffset = positionBytes.length; // already 4-byte aligned
  const bin = Buffer.concat([positionBytes, indexBytes]);
  const binPadded = Buffer.concat([
    bin,
    Buffer.alloc((4 - (bin.length % 4)) % 4, 0),
  ]);

  const json = {
    asset: { version: "2.0", generator: "make-ar-scene-fixtures.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Knight" }],
    meshes: [
      {
        name: "KnightMesh",
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        name: "KnightMaterial",
        pbrMetallicRoughness: {
          baseColorFactor: colour,
          metallicFactor: 0.1,
          roughnessFactor: 0.8,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        min: [-hw, 0, -hd],
        max: [hw, height, hd],
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: indices.length,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: indexOffset,
        byteLength: indexBytes.length,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: binPadded.length }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadded = Buffer.concat([
    jsonBytes,
    Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20), // pad with spaces
  ]);

  const chunk = (data, type) => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length, 0);
    header.writeUInt32LE(type, 4);
    return Buffer.concat([header, data]);
  };
  const jsonChunk = chunk(jsonPadded, 0x4e4f534a); // 'JSON'
  const binChunk = chunk(binPadded, 0x004e4942); // 'BIN\0'

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8);
  writeFileSync(path, Buffer.concat([header, jsonChunk, binChunk]));
}

writeGlb(join(outDir, "knight.glb"), {
  width: 0.6,
  height: 1.8,
  depth: 0.35,
  colour: [0.62, 0.66, 0.74, 1],
});
writePng(join(outDir, "banner.png"), 128, [196, 120, 60], [250, 230, 200]);
writeWav(join(outDir, "story-1.wav"), 3.5, 220);
writeWav(join(outDir, "story-2.wav"), 3.5, 294);

console.log(`wrote fixtures to ${outDir}`);
