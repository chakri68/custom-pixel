import type { Sample, SamplingMode } from "../types.ts";
import { luminance } from "./color.ts";
import type { LinearSource } from "./source.ts";

/**
 * Sampling strategy: downsample once, sample many.
 *
 * A box-filtered mip *is* the average colour per cell, computed for free by
 * the resampler. That makes `average` mode as cheap as `center` for every grid
 * type, hex and triangle included, instead of intersecting arbitrary cell
 * polygons with the source.
 */

export interface Mip {
  w: number;
  h: number;
  data: Float32Array; // RGBA linear, straight alpha
}

/** Area-average downsample. Alpha-weighted so transparent edges do not bleed. */
export function buildMip(src: LinearSource, mw: number, mh: number): Mip {
  const w = Math.max(1, Math.min(src.w, Math.round(mw)));
  const h = Math.max(1, Math.min(src.h, Math.round(mh)));
  const out = new Float32Array(w * h * 4);
  const s = src.data;

  for (let my = 0; my < h; my++) {
    const y0 = Math.floor((my * src.h) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((my + 1) * src.h) / h));
    for (let mx = 0; mx < w; mx++) {
      const x0 = Math.floor((mx * src.w) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((mx + 1) * src.w) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * src.w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          const al = s[i + 3];
          r += s[i] * al;
          g += s[i + 1] * al;
          b += s[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (my * w + mx) * 4;
      if (a > 1e-6) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = n > 0 ? a / n : 0;
    }
  }
  return { w, h, data: out };
}

/** Separable box blur, run twice for a passable gaussian. Radius in mip px. */
export function blurMip(mip: Mip, radius: number): Mip {
  const r = Math.round(radius);
  if (r < 1) return mip;
  const { w, h } = mip;
  const a = premultiply(mip.data);
  const b = new Float32Array(a.length);
  // Each pair of passes lands back in `a`, so `a` always holds the result.
  for (let pass = 0; pass < 2; pass++) {
    boxH(a, b, w, h, r);
    boxV(b, a, w, h, r);
  }
  return { w, h, data: unpremultiply(a) };
}

function premultiply(src: Float32Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const al = src[i + 3];
    out[i] = src[i] * al;
    out[i + 1] = src[i + 1] * al;
    out[i + 2] = src[i + 2] * al;
    out[i + 3] = al;
  }
  return out;
}

function unpremultiply(src: Float32Array): Float32Array {
  for (let i = 0; i < src.length; i += 4) {
    const al = src[i + 3];
    if (al > 1e-6) {
      src[i] /= al;
      src[i + 1] /= al;
      src[i + 2] /= al;
    }
  }
  return src;
}

function boxH(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
): void {
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        sum += src[row + clampi(k, 0, w - 1) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        dst[row + x * 4 + c] = sum / span;
        sum -= src[row + clampi(x - r, 0, w - 1) * 4 + c];
        sum += src[row + clampi(x + r + 1, 0, w - 1) * 4 + c];
      }
    }
  }
}

function boxV(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
): void {
  const span = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    const col = x * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        sum += src[clampi(k, 0, h - 1) * w * 4 + col + c];
      }
      for (let y = 0; y < h; y++) {
        dst[y * w * 4 + col + c] = sum / span;
        sum -= src[clampi(y - r, 0, h - 1) * w * 4 + col + c];
        sum += src[clampi(y + r + 1, 0, h - 1) * w * 4 + col + c];
      }
    }
  }
}

function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bilinear lookup in normalised UV, edge-clamped. */
export function sampleBilinear(
  data: Float32Array,
  w: number,
  h: number,
  u: number,
  v: number,
  out: Sample,
): void {
  const fx = u * w - 0.5;
  const fy = v * h - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = clampi(x0, 0, w - 1);
  const xb = clampi(x0 + 1, 0, w - 1);
  const ya = clampi(y0, 0, h - 1);
  const yb = clampi(y0 + 1, 0, h - 1);
  const i00 = (ya * w + xa) * 4;
  const i10 = (ya * w + xb) * 4;
  const i01 = (yb * w + xa) * 4;
  const i11 = (yb * w + xb) * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  out.r = data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
  out.g =
    data[i00 + 1] * w00 +
    data[i10 + 1] * w10 +
    data[i01 + 1] * w01 +
    data[i11 + 1] * w11;
  out.b =
    data[i00 + 2] * w00 +
    data[i10 + 2] * w10 +
    data[i01 + 2] * w01 +
    data[i11 + 2] * w11;
  out.a =
    data[i00 + 3] * w00 +
    data[i10 + 3] * w10 +
    data[i01 + 3] * w01 +
    data[i11 + 3] * w11;
}

/** Scratch buffers for the median pass, reused across cells. */
const medLum = new Float64Array(4096);
const medIdx = new Int32Array(4096);

/**
 * True per-cell median: rank the cell's pixels by luminance and take the
 * middle *pixel*, not a per-channel median, so the result is a colour that
 * actually occurs in the image rather than an invented average.
 */
export function sampleMedian(
  src: LinearSource,
  u: number,
  v: number,
  ru: number,
  rv: number,
  out: Sample,
): void {
  const cx = u * src.w;
  const cy = v * src.h;
  const rx = Math.max(0.5, ru * src.w);
  const ry = Math.max(0.5, rv * src.h);
  const x0 = clampi(Math.floor(cx - rx), 0, src.w - 1);
  const x1 = clampi(Math.ceil(cx + rx), 0, src.w - 1);
  const y0 = clampi(Math.floor(cy - ry), 0, src.h - 1);
  const y1 = clampi(Math.ceil(cy + ry), 0, src.h - 1);

  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  const stride = Math.max(1, Math.ceil(Math.sqrt(total / medLum.length)));

  const d = src.data;
  let n = 0;
  for (let y = y0; y <= y1 && n < medLum.length; y += stride) {
    for (let x = x0; x <= x1 && n < medLum.length; x += stride) {
      const i = (y * src.w + x) * 4;
      if (d[i + 3] <= 0.004) continue;
      medLum[n] = luminance(d[i], d[i + 1], d[i + 2]);
      medIdx[n] = i;
      n++;
    }
  }
  if (n === 0) {
    out.r = out.g = out.b = out.a = 0;
    return;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => medLum[a] - medLum[b],
  );
  const i = medIdx[order[n >> 1]];
  out.r = d[i];
  out.g = d[i + 1];
  out.b = d[i + 2];
  out.a = d[i + 3];
}

export function mipDimsFor(
  src: LinearSource,
  pitch: number,
  layoutW: number,
  layoutH: number,
  sampleRadius: number,
): { w: number; h: number } {
  // One mip texel per cell. A bigger sample radius means a coarser mip, which
  // is exactly "average over more than one cell" for free.
  const cellsAcross = layoutW / Math.max(1e-6, pitch * Math.max(0.05, sampleRadius));
  const w = Math.max(1, Math.min(src.w, Math.round(cellsAcross)));
  const h = Math.max(1, Math.min(src.h, Math.round((w * layoutH) / layoutW)));
  return { w, h };
}

export function needsMip(mode: SamplingMode): boolean {
  return mode === "average";
}
