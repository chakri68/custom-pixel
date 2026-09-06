import type { PropertyMapping, RenderConfig } from "../types.ts";

export function mapping(
  over: Partial<PropertyMapping> = {},
): PropertyMapping {
  return {
    enabled: false,
    metric: "luminance",
    invert: false,
    curve: { kind: "linear" },
    min: 0,
    max: 1,
    clamp: true,
    ...over,
  };
}

export const DEFAULT_CONFIG: RenderConfig = {
  columns: 64,
  fit: "contain",
  aspect: undefined,
  gridType: undefined,
  hexOrientation: "pointy",
  rowOffset: 0,
  colOffset: 0,
  jitter: 0,
  seed: 1,
  edge: "whole",

  primitive: "hexagon",
  shapeSet: ["circle", "diamond", "square"],
  polygonSides: 6,
  starPoints: 5,
  starInnerRatio: 0.4,
  crossThickness: 0.3,
  barThickness: 0.35,
  customSvgPath: undefined,
  glyphSet: "@%#*+=-:. ",

  gap: 0.06,
  rotation: 0,
  fill: true,
  stroke: false,
  strokeWidth: 0.06,
  strokeColor: "source",
  background: "#000000",
  transparentBackground: false,

  samplingMode: "average",
  sampleRadius: 1,
  preBlur: 0,

  color: { kind: "source" },
  contrast: 0,
  brightness: 0,

  // Ranges are pre-tuned so flipping "enabled" on gives something sensible
  // rather than a screen of nothing.
  sizeMapping: mapping({
    metric: "luminance",
    invert: true,
    curve: { kind: "sqrt" },
    min: 0.05,
    max: 1.1,
  }),
  rotationMapping: mapping({ metric: "hue", min: 0, max: 360, clamp: false }),
  opacityMapping: mapping({ metric: "luminance", min: 0.15, max: 1 }),
  strokeWidthMapping: mapping({
    metric: "luminance",
    invert: true,
    min: 0.01,
    max: 0.14,
  }),
  shapeMapping: mapping({ metric: "luminance", min: 0, max: 1 }),
};

export function cloneConfig(c: RenderConfig): RenderConfig {
  return structuredClone(c);
}
