import type { ColorMode } from "../types.ts";
import {
  hex8,
  hexToLinear,
  linearToOklab,
  linearToSrgb,
  luminance,
  SRGB_TO_LINEAR,
} from "./color.ts";
import type { Mip } from "./sampler.ts";

/**
 * Colour reduction. Palettes are derived from the mip rather than the source,
 * so palette generation costs the same whether the image is 500px or 5000px.
 */

/** Ordered dither, 4x4. Cheap, deterministic, and it beats banding. */
const BAYER4 = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map((v) => v / 16 - 0.46875);

export interface ColorResolver {
  /** Null unless the mode actually produced a palette. */
  palette: string[] | null;
  /** Linear-light RGB plus grid coords in, "#rrggbb" out. */
  resolve(r: number, g: number, b: number, gx: number, gy: number): string;
}

export function makeColorResolver(mode: ColorMode, mip: Mip | null): ColorResolver {
  switch (mode.kind) {
    case "source":
      return {
        palette: null,
        resolve: (r, g, b) => toHex(r, g, b),
      };

    case "grayscale":
      return {
        palette: null,
        resolve: (r, g, b) => {
          const y = luminance(r, g, b);
          return toHex(y, y, y);
        },
      };

    case "posterize": {
      const levels = Math.max(2, Math.round(mode.levels));
      const step = levels - 1;
      return {
        palette: null,
        resolve: (r, g, b) =>
          hex8(
            post(linearToSrgb(r), step),
            post(linearToSrgb(g), step),
            post(linearToSrgb(b), step),
          ),
      };
    }

    case "quantize": {
      const count = Math.max(2, Math.round(mode.count));
      const colors = mip ? medianCutPalette(mip, count) : ["#000000", "#ffffff"];
      return paletteResolver(colors, mode.dither);
    }

    case "palette": {
      const colors = mode.colors.length ? mode.colors : ["#000000", "#ffffff"];
      return paletteResolver(colors, mode.dither);
    }
  }
}

function post(v: number, step: number): number {
  return Math.round((Math.round(v * step) / step) * 255);
}

function toHex(r: number, g: number, b: number): string {
  return hex8(
    Math.round(linearToSrgb(r) * 255),
    Math.round(linearToSrgb(g) * 255),
    Math.round(linearToSrgb(b) * 255),
  );
}

/* ----------------------------------------------------------- palette match */

function paletteResolver(colors: string[], dither: boolean): ColorResolver {
  const match = makeMatcher(colors);
  // Dither amplitude tracks the average per-channel gap between palette
  // entries; too much and gradients turn to static.
  const amp = dither ? 0.8 / Math.cbrt(colors.length) : 0;
  return {
    palette: colors,
    resolve(r, g, b, gx, gy) {
      if (!dither) return colors[match(r, g, b)];
      const t = BAYER4[(((gy % 4) + 4) % 4) * 4 + (((gx % 4) + 4) % 4)] * amp;
      // Nudge in sRGB: that is the space the eye averages the pattern in.
      return colors[
        match(
          SRGB_TO_LINEAR[q255(linearToSrgb(r) + t)],
          SRGB_TO_LINEAR[q255(linearToSrgb(g) + t)],
          SRGB_TO_LINEAR[q255(linearToSrgb(b) + t)],
        )
      ];
    },
  };
}

function q255(v: number): number {
  const n = Math.round(v * 255);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/**
 * Nearest palette entry in Oklab. Euclidean distance in sRGB or linear RGB
 * both pick visibly wrong entries around saturated colours; Oklab does not.
 *
 * Backed by a 15-bit lookup cache, because adjacent cells almost always land
 * on the same entry.
 */
export function makeMatcher(
  colors: string[],
): (r: number, g: number, b: number) => number {
  const lab = colors.map((c) => {
    const [r, g, b] = hexToLinear(c);
    return linearToOklab(r, g, b);
  });
  const cache = new Int16Array(1 << 15).fill(-1);

  return (r, g, b) => {
    const key =
      ((q255(linearToSrgb(r)) >> 3) << 10) |
      ((q255(linearToSrgb(g)) >> 3) << 5) |
      (q255(linearToSrgb(b)) >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;

    const p = linearToOklab(r, g, b);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < lab.length; i++) {
      const dL = p.L - lab[i].L;
      const da = p.a - lab[i].a;
      const db = p.b - lab[i].b;
      const d = dL * dL + da * da + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };
}

/* -------------------------------------------------------------- median cut */

interface Box {
  start: number;
  end: number; // exclusive
  range: number;
  axis: 0 | 1 | 2;
}

/**
 * Median cut over the mip. Repeatedly splits the box with the widest channel
 * spread at its median, then averages each box in linear light.
 *
 * Deterministic: same image and same count give the same palette every time,
 * which is what makes presets and shared URLs reproduce.
 */
export function medianCutPalette(mip: Mip, count: number): string[] {
  const d = mip.data;
  const total = mip.w * mip.h;
  const stride = Math.max(1, Math.ceil(total / 20000));

  const pts: number[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (d[o + 3] <= 0.02) continue;
    pts.push(d[o], d[o + 1], d[o + 2]);
  }
  if (pts.length === 0) return ["#000000"];

  const n = pts.length / 3;
  const buf = Float64Array.from(pts);
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;

  let boxes: Box[] = [measure(buf, idx, 0, n)];
  while (boxes.length < count) {
    let bi = -1;
    let bestRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].end - boxes[i].start > 1 && boxes[i].range > bestRange) {
        bestRange = boxes[i].range;
        bi = i;
      }
    }
    if (bi < 0) break; // Image has fewer distinct colours than requested.

    const box = boxes[bi];
    const axis = box.axis;
    const slice = Array.from(idx.subarray(box.start, box.end)).sort(
      (a, b) => buf[a * 3 + axis] - buf[b * 3 + axis],
    );
    idx.set(slice, box.start);
    const mid = box.start + ((box.end - box.start) >> 1);
    boxes = boxes
      .slice(0, bi)
      .concat(
        [measure(buf, idx, box.start, mid), measure(buf, idx, mid, box.end)],
        boxes.slice(bi + 1),
      );
  }

  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = box.start; i < box.end; i++) {
      const o = idx[i] * 3;
      r += buf[o];
      g += buf[o + 1];
      b += buf[o + 2];
    }
    const c = box.end - box.start;
    return toHex(r / c, g / c, b / c);
  });
}

function measure(
  buf: Float64Array,
  idx: Int32Array,
  start: number,
  end: number,
): Box {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    const o = idx[i] * 3;
    for (let c = 0; c < 3; c++) {
      const v = buf[o + c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
    }
  }
  let axis: 0 | 1 | 2 = 0;
  let range = hi[0] - lo[0];
  for (const c of [1, 2] as const) {
    if (hi[c] - lo[c] > range) {
      range = hi[c] - lo[c];
      axis = c;
    }
  }
  return { start, end, range, axis };
}
