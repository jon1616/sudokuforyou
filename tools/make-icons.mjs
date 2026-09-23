#!/usr/bin/env node
/*
  Disegna le icone dell'app (griglia con un cuore al centro) e le salva in icons/.

      node tools/make-icons.mjs

  Niente librerie: forme calcolate punto per punto (con antialiasing) e PNG
  scritto a mano con zlib di Node.
*/

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(out, { recursive: true });

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#7a6bd1");
const PAPER = hex("#fffdf9");
const THICK = hex("#5b5468");
const THIN = hex("#ddd4ec");
const HEART = hex("#e5698f");

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Colore nel punto (x, y) in coordinate 0..1; null = trasparente
function colorAt(x, y, maskable) {
  if (!maskable && !inRoundRect(x, y, 0, 0, 1, 1, 0.22)) return null;
  const s = maskable ? 0.74 : 1;
  const u = (x - 0.5) / s + 0.5, v = (y - 0.5) / s + 0.5;
  const b0 = 0.17, b1 = 0.83, size = b1 - b0;
  if (!inRoundRect(u, v, b0, b0, b1, b1, 0.07)) return BG;

  // Cuore al centro
  const hx = (u - 0.5) / 0.082, hy = -(v - 0.515) / 0.082;
  if ((hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0) return HEART;

  // Linee della griglia
  const gx = ((u - b0) / size) * 9, gy = ((v - b0) / size) * 9;
  const near = (g, k) => Math.abs(g - k) * (size / 9);
  for (const k of [3, 6]) if (near(gx, k) < 0.009 || near(gy, k) < 0.009) return THICK;
  for (const k of [1, 2, 4, 5, 7, 8]) if (near(gx, k) < 0.0035 || near(gy, k) < 0.0035) return THIN;
  return PAPER;
}

function render(size, maskable) {
  const SS = 4; // campioni per lato di ogni pixel
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((pxl + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = (py * size + pxl) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, px);
}

// ---------- PNG ----------

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
]) {
  writeFileSync(join(out, name), render(size, maskable));
  console.log(`icons/${name}`);
}
