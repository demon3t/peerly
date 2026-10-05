// Renders the app icon (teal tile, three connected peers) with signed
// distance fields and writes build/icon.png, build/icon.ico and the runtime
// copy electron/assets/icon.png. No dependencies: run `npm run icon`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUPERSAMPLE = 4;

// ---------- geometry (unit square 0..1) ----------

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(x, y, ax, ay, bx, by, r) {
  const px = x - ax,
    py = y - ay,
    dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * t, py - dy * t) - r;
}

function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

// Three peers connected to each other; the gold one is "you".
const NODES = [
  { x: 0.5, y: 0.29, r: 0.105, gold: true },
  { x: 0.28, y: 0.68, r: 0.095 },
  { x: 0.72, y: 0.68, r: 0.095 },
];

function sample(x, y) {
  // background tile
  const tile = sdRoundRect(x, y, 0.5, 0.5, 0.46, 0.46, 0.2);
  if (tile > 0) return [0, 0, 0, 0];

  // diagonal gradient teal -> deep teal
  const t = (x + y) / 2;
  let r = 20 + (8 - 20) * t,
    g = 150 + (82 - 150) * t,
    b = 140 + (88 - 140) * t;

  // soft top highlight
  const glow = Math.max(0, 1 - Math.hypot(x - 0.3, y - 0.2) / 0.55) * 0.18;
  r += (255 - r) * glow;
  g += (255 - g) * glow;
  b += (255 - b) * glow;

  for (const node of NODES) {
    if (sdCircle(x, y, node.x, node.y, node.r) <= 0) return node.gold ? [255, 214, 120, 255] : [255, 255, 255, 255];
  }
  const links = Math.min(
    sdSegment(x, y, NODES[0].x, NODES[0].y, NODES[1].x, NODES[1].y, 0.032),
    sdSegment(x, y, NODES[0].x, NODES[0].y, NODES[2].x, NODES[2].y, 0.032),
    sdSegment(x, y, NODES[1].x, NODES[1].y, NODES[2].x, NODES[2].y, 0.032),
  );
  if (links <= 0) return [255, 255, 255, 255];
  return [r, g, b, 255];
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const [cr, cg, cb, ca] = sample(
            (px + (sx + 0.5) / SUPERSAMPLE) / size,
            (py + (sy + 0.5) / SUPERSAMPLE) / size,
          );
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const i = (py * size + px) * 4;
      pixels[i] = a ? Math.round(r / a) : 0;
      pixels[i + 1] = a ? Math.round(g / a) : 0;
      pixels[i + 2] = a ? Math.round(b / a) : 0;
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return pixels;
}

// ---------- encoders ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO with PNG-compressed entries (supported since Windows Vista).
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/** Apple .icns: PNG entries ic07…ic10 (128–1024 px) behind an 'icns' header. */
function encodeIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

// ---------- output ----------

const images = SIZES.map((size) => ({ size, png: encodePng(size, render(size)) }));
const largest = images[images.length - 1].png;
// Linux packages use build/icon.png (at least 512 px); macOS uses build/icon.icns.
const PACKAGE_SIZE = 1024;
const packagePng = encodePng(PACKAGE_SIZE, render(PACKAGE_SIZE));
const ICNS_TYPES = { 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'electron', 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), packagePng);
fs.writeFileSync(
  path.join(root, 'build', 'icon.icns'),
  encodeIcns(
    Object.entries(ICNS_TYPES).map(([size, type]) => ({
      type,
      png: Number(size) === PACKAGE_SIZE ? packagePng : encodePng(Number(size), render(Number(size))),
    })),
  ),
);
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), encodeIco(images));
fs.writeFileSync(path.join(root, 'electron', 'assets', 'icon.png'), largest);
console.log(`Icon written (${SIZES.join(', ')} px; package icon and .icns up to ${PACKAGE_SIZE} px).`);
