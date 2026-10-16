import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GLYPHS = {
  J: ["11111", "00100", "00100", "00100", "00100", "10010", "01100"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

const BG = [10, 102, 194];
const FG = [255, 255, 255];

function renderIcon(size) {
  const S = size * 2;
  const radius = S * 0.2;
  const letters = [GLYPHS.J, GLYPHS.T];
  const textScale = Math.max(1, Math.floor((S * 0.58) / 11));
  const tw = 11 * textScale;
  const th = 7 * textScale;
  const tx = Math.floor((S - tw) / 2);
  const ty = Math.floor((S - th) / 2);

  function inRounded(x, y) {
    const cx = Math.min(Math.max(x, radius), S - radius);
    const cy = Math.min(Math.max(y, radius), S - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  function pixelAt(x, y) {
    if (!inRounded(x + 0.5, y + 0.5)) return null;
    const gx = x - tx;
    const gy = y - ty;
    if (gx >= 0 && gx < tw && gy >= 0 && gy < th) {
      const col = Math.floor(gx / textScale);
      const row = Math.floor(gy / textScale);
      const letterIndex = col < 5 ? 0 : col === 5 ? -1 : 1;
      const glyphCol = col < 5 ? col : col - 6;
      if (letterIndex >= 0 && letters[letterIndex][row][glyphCol] === "1") return FG;
    }
    return BG;
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const c = pixelAt(x * 2 + dx, y * 2 + dy);
          if (c) {
            pr += c[0];
            pg += c[1];
            pb += c[2];
            pa += 1;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (pa === 0) continue;
      out[i] = Math.round(pr / pa);
      out[i + 1] = Math.round(pg / pa);
      out[i + 2] = Math.round(pb / pa);
      out[i + 3] = Math.round((pa / 4) * 255);
    }
  }
  return out;
}

for (const size of [16, 48, 128]) {
  const png = encodePng(size, size, renderIcon(size));
  const file = path.join(HERE, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
