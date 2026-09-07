import { unzlibSync, zlibSync } from "fflate";

/**
 * Losslessly re-encodes a PNG smaller. Chromium's screenshot encoder picks per-line filters
 * with a fast deflate, which does poorly on gradients. Re-filtering every line with Sub and
 * deflating at level 9 typically cuts 30 to 40 percent with identical pixels.
 *
 * Handles 8-bit RGB and RGBA, non-interlaced, which is what screenshots are. Anything else is
 * returned untouched, as is any result that didn't get smaller.
 *
 * @param {Uint8Array} png
 * @returns {Uint8Array}
 */
export function optimizePng(png) {
  const chunks = readChunks(png);
  if (!chunks) return png;
  const { ihdr, idat } = chunks;

  const width = readU32(ihdr, 0);
  const height = readU32(ihdr, 4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return png;

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = unzlibSync(idat);
  if (raw.length !== height * (stride + 1)) return png;

  const pixels = unfilter(raw, width, height, bpp);
  const filtered = subFilter(pixels, height, stride, bpp);
  const compressed = zlibSync(filtered, { level: 9 });

  const out = writePng(ihdr, compressed);
  return out.length < png.length ? out : png;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** @param {Uint8Array} png */
function readChunks(png) {
  if (png.length < 8 || SIGNATURE.some((b, i) => png[i] !== b)) return null;
  let ihdr = null;
  const idats = [];
  let pos = 8;
  while (pos + 8 <= png.length) {
    const length = readU32(png, pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  if (!ihdr || idats.length === 0) return null;
  const idat = new Uint8Array(idats.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of idats) {
    idat.set(c, offset);
    offset += c.length;
  }
  return { ihdr, idat };
}

/**
 * Reverses PNG scanline filtering into raw pixel bytes.
 *
 * @param {Uint8Array} raw
 * @param {number} width
 * @param {number} height
 * @param {number} bpp
 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) pred = paeth(a, b, c);
      out[dst + i] = (x + pred) & 255;
    }
  }
  return out;
}

/**
 * Applies the Sub filter to every scanline.
 *
 * @param {Uint8Array} pixels
 * @param {number} height
 * @param {number} stride
 * @param {number} bpp
 */
function subFilter(pixels, height, stride, bpp) {
  const out = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const src = y * stride;
    const dst = y * (stride + 1);
    out[dst] = 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? pixels[src + i - bpp] : 0;
      out[dst + 1 + i] = (pixels[src + i] - a) & 255;
    }
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @param {Uint8Array} ihdr
 * @param {Uint8Array} idat
 */
function writePng(ihdr, idat) {
  const out = new Uint8Array(8 + (12 + ihdr.length) + (12 + idat.length) + 12);
  out.set(SIGNATURE, 0);
  let pos = writeChunk(out, 8, "IHDR", ihdr);
  pos = writeChunk(out, pos, "IDAT", idat);
  writeChunk(out, pos, "IEND", new Uint8Array(0));
  return out;
}

/**
 * @param {Uint8Array} out
 * @param {number} pos
 * @param {string} type
 * @param {Uint8Array} data
 */
function writeChunk(out, pos, type, data) {
  writeU32(out, pos, data.length);
  for (let i = 0; i < 4; i++) out[pos + 4 + i] = type.charCodeAt(i);
  out.set(data, pos + 8);
  writeU32(out, pos + 8 + data.length, crc32(out.subarray(pos + 4, pos + 8 + data.length)));
  return pos + 12 + data.length;
}

function readU32(buf, pos) {
  return ((buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
}

function writeU32(buf, pos, value) {
  buf[pos] = (value >>> 24) & 255;
  buf[pos + 1] = (value >>> 16) & 255;
  buf[pos + 2] = (value >>> 8) & 255;
  buf[pos + 3] = value & 255;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
