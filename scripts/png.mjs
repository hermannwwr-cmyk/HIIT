// A small lossless PNG re-encoder in plain Node (zlib only): no dependencies.
//   node scripts/png.mjs file.png [more.png …]     re-encodes the files in place when that makes them smaller
// Used by render-icons.mjs. Handles what Chromium's screenshots are: 8-bit RGB or RGBA, not interlaced.
// The pixels never change: optimise() decodes its own output and compares it with the input before returning it.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// → { width, height, channels (3 or 4), pixels (rows of raw bytes, no filter bytes), extra: [{type, data}] }
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let ihdr = null;
  const idat = [], extra = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type !== 'IEND') extra.push({ type, data });
    o += 12 + len;
  }
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colour = ihdr[9], interlace = ihdr[12];
  if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
    throw new Error('only 8-bit RGB/RGBA, non-interlaced PNGs are handled (got depth ' + depth + ', colour type ' + colour + ')');
  }
  const channels = colour === 6 ? 4 : 3, stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[dst + x - channels] : 0;
      const b = y ? pixels[dst + x - stride] : 0;
      const c = y && x >= channels ? pixels[dst + x - stride - channels] : 0;
      const v = raw[src + x];
      pixels[dst + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  return { width, height, channels, pixels, extra };
}

// One filtered scanline stream; pick(y, candidates) chooses the filter for row y (0..4).
function filtered(img, fixed) {
  const { width, height, channels, pixels } = img, stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);
  const rows = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const at = y * stride;
    let best = fixed, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      if (fixed >= 0 && f !== fixed) continue;
      const row = rows[f];
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? pixels[at + x - channels] : 0;
        const b = y ? pixels[at + x - stride] : 0;
        const c = y && x >= channels ? pixels[at + x - stride - channels] : 0;
        const v = pixels[at + x];
        const r = (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 255;
        row[x] = r;
        sum += r < 128 ? r : 256 - r; // the usual heuristic: the smallest sum of absolute differences
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    out[y * (stride + 1)] = best;
    rows[best].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

export function encode(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = img.channels === 4 ? 6 : 2;
  // every fixed filter and the per-row choice, each with zlib's strategies: keep the smallest stream
  let best = null;
  for (const fixed of [-1, 0, 1, 2, 3, 4]) {
    const stream = filtered(img, fixed);
    for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE]) {
      const z = zlib.deflateSync(stream, { level: 9, memLevel: 9, windowBits: 15, strategy });
      if (!best || z.length < best.length) best = z;
    }
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), ...(img.extra || []).map(c => chunk(c.type, c.data)), chunk('IDAT', best), chunk('IEND', Buffer.alloc(0))]);
}

// The same picture as RGBA bytes, whatever the file's colour type: what "pixel-identical" compares.
export function rgba(img) {
  if (img.channels === 4) return img.pixels;
  const out = Buffer.alloc(img.width * img.height * 4, 255);
  for (let i = 0, o = 0; i < img.pixels.length; i += 3, o += 4) { out[o] = img.pixels[i]; out[o + 1] = img.pixels[i + 1]; out[o + 2] = img.pixels[i + 2]; }
  return out;
}

// Returns the smaller encoding of the same pixels, or the input when it can't be beaten.
export function optimise(buf) {
  const img = decode(buf);
  let slim = img;
  if (img.channels === 4) { // fully opaque: drop the alpha channel
    let opaque = true;
    for (let i = 3; i < img.pixels.length; i += 4) if (img.pixels[i] !== 255) { opaque = false; break; }
    if (opaque) {
      const rgb = Buffer.alloc(img.width * img.height * 3);
      for (let i = 0, o = 0; i < img.pixels.length; i += 4, o += 3) { rgb[o] = img.pixels[i]; rgb[o + 1] = img.pixels[i + 1]; rgb[o + 2] = img.pixels[i + 2]; }
      slim = { ...img, channels: 3, pixels: rgb };
    }
  }
  const out = encode(slim);
  const back = decode(out);
  if (back.width !== img.width || back.height !== img.height || !rgba(back).equals(rgba(img))) throw new Error('re-encoded PNG does not decode to the same pixels');
  return out.length < buf.length ? out : buf;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const file of process.argv.slice(2)) {
    const before = fs.readFileSync(file), after = optimise(before);
    if (after !== before) fs.writeFileSync(file, after);
    console.log(file, before.length + ' → ' + after.length + ' bytes');
  }
}
