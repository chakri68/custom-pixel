/**
 * Colour utilities. Everything the pipeline touches lives in linear light;
 * sRGB encoding happens only at the boundaries (reading pixels, writing
 * `fill` strings). Skipping the linear decode makes size mappings bunch into
 * the midtones and averaged colours go muddy, so it is not optional.
 */

/** 8-bit sRGB -> linear, precomputed because it runs per pixel per load. */
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Rec. 709 luminance on linear RGB. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear-light mid-gray (sRGB 0.5). Contrast pivots here, not at 0.5. */
export const MID_GRAY_LINEAR = 0.21404114;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export interface Hsl {
  h: number; // [0, 1)
  s: number; // [0, 1]
  l: number; // [0, 1]
}

/** HSL from linear-decoded RGB, per the spec's colour-space rules. */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

/* ------------------------------------------------------------------ Oklab */

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** Linear sRGB -> Oklab. Used for perceptual palette matching. */
export function linearToOklab(r: number, g: number, b: number): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/* --------------------------------------------------------------- hex I/O */

/** Parses #rgb / #rrggbb / #rrggbbaa. Returns null on anything else. */
export function parseHex(
  hex: string,
): { r: number; g: number; b: number; a: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

const HEX2 = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/** 8-bit sRGB channels -> "#rrggbb". Hot path: called once per cell. */
export function hex8(r: number, g: number, b: number): string {
  return "#" + HEX2[r & 255] + HEX2[g & 255] + HEX2[b & 255];
}

/** Linear-light RGB -> "#rrggbb". */
export function linearToHex(r: number, g: number, b: number): string {
  return hex8(
    Math.round(linearToSrgb(r) * 255),
    Math.round(linearToSrgb(g) * 255),
    Math.round(linearToSrgb(b) * 255),
  );
}

/** Hex string -> linear-light RGB, for user palettes. */
export function hexToLinear(hex: string): [number, number, number] {
  const p = parseHex(hex);
  if (!p) return [0, 0, 0];
  return [
    SRGB_TO_LINEAR[p.r],
    SRGB_TO_LINEAR[p.g],
    SRGB_TO_LINEAR[p.b],
  ] as [number, number, number];
}
