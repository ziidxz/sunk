import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src");

const PAPER = [244, 239, 228];
const INK = [27, 25, 21];
const RED = [166, 58, 43];

function insideBar(x, y, left, right, top, bottom) {
  return x >= left && x <= right && y >= top && y <= bottom;
}

function insideDot(x, y) {
  const dx = x - 362;
  const dy = y - 325;
  return dx * dx + dy * dy <= 30 * 30;
}

function sample(u, v) {
  if (insideBar(u, v, 96, 416, 170, 204)) return INK;
  if (insideBar(u, v, 96, 352, 239, 273)) return INK;
  if (insideBar(u, v, 96, 288, 308, 342)) return INK;
  if (insideDot(u, v)) return RED;
  return PAPER;
}

function render(size, grid = 4) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 512 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < grid; sy++) {
        for (let sx = 0; sx < grid; sx++) {
          const u = (px + (sx + 0.5) / grid) * step;
          const v = (py + (sy + 0.5) / grid) * step;
          const color = sample(u, v);
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      const total = grid * grid;
      const index = (py * size + px) * 4;
      rgba[index] = Math.round(r / total);
      rgba[index + 1] = Math.round(g / total);
      rgba[index + 2] = Math.round(b / total);
      rgba[index + 3] = 255;
    }
  }
  return rgba;
}

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const rgba = render(size);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180]
]) {
  const data = png(size);
  writeFileSync(join(out, name), data);
  console.log(name, size + "x" + size, data.length + " bytes");
}
