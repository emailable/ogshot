import { unzlibSync, zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { optimizePng } from "../src/png.js";

// Builds a valid 8-bit RGB PNG with Chromium-like adaptive filters (Up on every line).
function makePng(width, height, pixelAt) {
  const stride = width * 3;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) pixels.set(pixelAt(x, y), y * stride + x * 3);

  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 2; // Up filter
    for (let i = 0; i < stride; i++) {
      const above = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      raw[y * (stride + 1) + 1 + i] = (pixels[y * stride + i] - above) & 255;
    }
  }

  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const idat = zlibSync(raw, { level: 1 });
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8); // CRC left zero; the optimizer doesn't verify it
    return out;
  };
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    png.set(p, pos);
    pos += p.length;
  }
  return { png, pixels };
}

// Decodes our own output back to raw pixels to prove it is lossless.
function decode(png) {
  const view = new DataView(png.buffer, png.byteOffset);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let pos = 8;
  let idat = new Uint8Array();
  while (pos < png.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    if (type === "IDAT") idat = png.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
  }
  const raw = unzlibSync(idat);
  const stride = width * 3;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(1); // Sub filter on every line
    for (let i = 0; i < stride; i++) {
      const left = i >= 3 ? pixels[y * stride + i - 3] : 0;
      pixels[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + left) & 255;
    }
  }
  return { width, height, pixels };
}

describe("optimizePng", () => {
  it("re-encodes smaller with identical pixels", () => {
    // A horizontal gradient with text-like noise, the shape of a real OG card.
    const { png, pixels } = makePng(120, 63, (x, y) => [x * 2, (y * 4) & 255, (x * y) & 255]);
    const out = optimizePng(png);
    expect(out.length).toBeLessThan(png.length);
    const decoded = decode(out);
    expect(decoded.width).toBe(120);
    expect(decoded.height).toBe(63);
    expect(decoded.pixels).toEqual(pixels);
  });

  it("returns input untouched when it isn't a PNG it understands", () => {
    const notPng = new Uint8Array([1, 2, 3, 4]);
    expect(optimizePng(notPng)).toBe(notPng);
  });
});
