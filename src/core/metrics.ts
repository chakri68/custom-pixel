import type { Metric, PropertyMapping, Sample } from "../types.ts";
import { luminance, rgbToHsl } from "./color.ts";
import { applyCurve } from "./curves.ts";

/**
 * A metric is a normalised [0, 1] scalar pulled off one cell's sample. A
 * mapping turns one metric into one visual property. Any metric can drive any
 * property — that generality is the point of the engine.
 */

export interface MetricContext {
  /** Distance from canvas centre, normalised so a corner is 1. */
  dist: number;
  /** Seeded per-cell noise. */
  noise: number;
}

export const METRIC_LABELS: Record<Metric, string> = {
  luminance: "Luminance",
  hue: "Hue",
  saturation: "Saturation",
  lightness: "Lightness",
  red: "Red",
  green: "Green",
  blue: "Blue",
  alpha: "Alpha",
  distanceFromCenter: "Dist from centre",
  noise: "Noise",
  constant: "Constant",
};

export const METRICS = Object.keys(METRIC_LABELS) as Metric[];

export function metricValue(
  m: Metric,
  s: Sample,
  ctx: MetricContext,
): number {
  switch (m) {
    case "luminance":
      return luminance(s.r, s.g, s.b);
    case "red":
      return s.r;
    case "green":
      return s.g;
    case "blue":
      return s.b;
    case "alpha":
      return s.a;
    case "distanceFromCenter":
      return ctx.dist;
    case "noise":
      return ctx.noise;
    case "constant":
      return 1;
    case "hue":
      return rgbToHsl(s.r, s.g, s.b).h;
    case "saturation":
      return rgbToHsl(s.r, s.g, s.b).s;
    case "lightness":
      return rgbToHsl(s.r, s.g, s.b).l;
  }
}

/**
 * The whole mapping pipeline:
 *
 *     metric -> [invert] -> curve -> lerp(min, max) -> [clamp]
 *
 * `fallback` is what the property is worth when the mapping is switched off.
 */
export function applyMapping(
  mapping: PropertyMapping,
  s: Sample,
  ctx: MetricContext,
  fallback: number,
): number {
  if (!mapping.enabled) return fallback;
  let x = metricValue(mapping.metric, s, ctx);
  if (mapping.invert) x = 1 - x;
  x = applyCurve(mapping.curve, x);
  let v = mapping.min + (mapping.max - mapping.min) * x;
  if (mapping.clamp) {
    const lo = Math.min(mapping.min, mapping.max);
    const hi = Math.max(mapping.min, mapping.max);
    v = v < lo ? lo : v > hi ? hi : v;
  }
  return v;
}

/** Raw [0, 1] output of a mapping, for properties that bucket rather than lerp. */
export function mappingUnit(
  mapping: PropertyMapping,
  s: Sample,
  ctx: MetricContext,
): number {
  let x = metricValue(mapping.metric, s, ctx);
  if (mapping.invert) x = 1 - x;
  return applyCurve(mapping.curve, x);
}
