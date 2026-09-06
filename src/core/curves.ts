import type { Curve } from "../types.ts";

/**
 * Curve evaluation for the mapping pipeline. Input and output are both
 * [0, 1]; the lerp to real units happens downstream.
 */

function cubicBezier1d(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/**
 * A CSS-style ease: the curve is parametric in t, but we are handed x, so
 * invert x(t) first. Newton converges in a couple of steps for sane control
 * points; bisection catches the flat-derivative cases.
 */
function easeAt(x: number, p1: [number, number], p2: [number, number]): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const xt = cubicBezier1d(t, p1[0], p2[0]) - x;
    if (Math.abs(xt) < 1e-6) break;
    const mt = 1 - t;
    const d =
      3 * mt * mt * p1[0] +
      6 * mt * t * (p2[0] - p1[0]) +
      3 * t * t * (1 - p2[0]);
    if (Math.abs(d) < 1e-6) {
      // Derivative died; fall back to bisection on the remaining bracket.
      let lo = 0;
      let hi = 1;
      for (let j = 0; j < 24; j++) {
        t = (lo + hi) / 2;
        if (cubicBezier1d(t, p1[0], p2[0]) < x) lo = t;
        else hi = t;
      }
      break;
    }
    t -= xt / d;
  }
  return cubicBezier1d(Math.min(1, Math.max(0, t)), p1[1], p2[1]);
}

export function applyCurve(curve: Curve, x: number): number {
  const v = x < 0 ? 0 : x > 1 ? 1 : x;
  switch (curve.kind) {
    case "linear":
      return v;
    case "pow":
      return v ** Math.max(0.01, curve.gamma);
    case "sqrt":
      return Math.sqrt(v);
    case "smoothstep":
      return v * v * (3 - 2 * v);
    case "ease":
      return easeAt(v, curve.p1, curve.p2);
  }
}
