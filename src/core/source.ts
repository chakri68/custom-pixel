import type { FitMode } from "../types.ts";
import { MID_GRAY_LINEAR, SRGB_TO_LINEAR } from "./color.ts";

/**
 * Turns the uploaded bitmap into a linear-light float buffer, fitted to the
 * output aspect.
 *
 * The buffer resolution is deliberately decoupled from the render resolution.
 * Cells address it in normalised UV, so exporting at 4x scales the drawing and
 * nothing else — no resample, no re-layout, no 276 MB float buffer.
 */

const SOURCE_MAX_EDGE = 1600;

export interface LinearSource {
  w: number;
  h: number;
  /** RGBA, linear light, straight (non-premultiplied) alpha. */
  data: Float32Array;
}

export interface SourceKey {
  aspect: number;
  fit: FitMode;
}

export function buildSource(
  bitmap: ImageBitmap,
  aspect: number,
  fit: FitMode,
): LinearSource {
  const nativeLong = Math.max(bitmap.width, bitmap.height, 512);
  const long = Math.min(SOURCE_MAX_EDGE, nativeLong);
  const w = Math.max(1, Math.round(aspect >= 1 ? long : long * aspect));
  const h = Math.max(1, Math.round(aspect >= 1 ? long / aspect : long));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Anything outside the drawn rect stays transparent. The pipeline drops
  // zero-alpha cells, so `contain` letterboxing and PNG alpha both fall out of
  // the same rule.
  const iw = bitmap.width;
  const ih = bitmap.height;
  if (fit === "stretch") {
    ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    const s =
      fit === "cover"
        ? Math.max(w / iw, h / ih)
        : Math.min(w / iw, h / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    out[i] = SRGB_TO_LINEAR[px[i]];
    out[i + 1] = SRGB_TO_LINEAR[px[i + 1]];
    out[i + 2] = SRGB_TO_LINEAR[px[i + 2]];
    out[i + 3] = px[i + 3] / 255;
  }
  return { w, h, data: out };
}

/**
 * Brightness is an exposure multiplier and contrast pivots on linear mid-gray
 * (sRGB 0.5, not linear 0.5) — pivoting at 0.5 in linear light would crush
 * everything below three-quarter tone.
 */
export function adjustSource(
  src: LinearSource,
  contrast: number,
  brightness: number,
): LinearSource {
  if (contrast === 0 && brightness === 0) return src;
  const exposure = 2 ** brightness;
  const k = Math.tan(((Math.min(0.98, Math.max(-0.98, contrast)) + 1) * Math.PI) / 4);
  const src4 = src.data;
  const out = new Float32Array(src4.length);
  for (let i = 0; i < src4.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = src4[i + c] * exposure;
      v = (v - MID_GRAY_LINEAR) * k + MID_GRAY_LINEAR;
      out[i + c] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    out[i + 3] = src4[i + 3];
  }
  return { w: src.w, h: src.h, data: out };
}
