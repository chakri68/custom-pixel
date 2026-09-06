/**
 * The whole app hangs off `RenderConfig`. It is the store shape, the preset
 * format and the URL state — there is exactly one config type.
 */

export type PrimitiveType =
  | "square"
  | "circle"
  | "hexagon"
  | "triangle"
  | "diamond"
  | "cross"
  | "hbar"
  | "vbar"
  | "star"
  | "polygon"
  | "heart"
  | "ring"
  | "rounded"
  | "glyph"
  | "custom-svg";

export type GridType =
  | "rect"
  | "staggered"
  | "hex"
  | "triangle"
  | "polar"
  | "scatter";

export type SamplingMode = "center" | "average" | "median";

export type Metric =
  | "luminance"
  | "hue"
  | "saturation"
  | "lightness"
  | "red"
  | "green"
  | "blue"
  | "alpha"
  | "distanceFromCenter"
  | "noise"
  | "constant";

export type Curve =
  | { kind: "linear" }
  | { kind: "pow"; gamma: number }
  | { kind: "sqrt" }
  | { kind: "smoothstep" }
  | { kind: "ease"; p1: [number, number]; p2: [number, number] };

export type CurveKind = Curve["kind"];

export interface PropertyMapping {
  enabled: boolean;
  metric: Metric;
  invert: boolean;
  curve: Curve;
  min: number;
  max: number;
  clamp: boolean;
}

export type FitMode = "contain" | "cover" | "stretch";

export type ColorMode =
  | { kind: "source" }
  | { kind: "grayscale" }
  | { kind: "quantize"; count: number; dither: boolean }
  | { kind: "palette"; colors: string[]; dither: boolean }
  | { kind: "posterize"; levels: number };

export type ColorModeKind = ColorMode["kind"];

export interface RenderConfig {
  // Layout
  columns: number;
  fit: FitMode;
  aspect?: number; // undefined = source aspect
  gridType?: GridType; // undefined = primitive default
  hexOrientation: "pointy" | "flat";
  rowOffset: number;
  colOffset: number;
  jitter: number;
  seed: number;
  /**
   * "whole" ends the composition on complete shapes; "bleed" lets cells run
   * off and be clipped by the canvas edge.
   */
  edge: "whole" | "bleed";

  // Shape
  primitive: PrimitiveType;
  shapeSet?: PrimitiveType[]; // used when shapeMapping.enabled
  polygonSides?: number;
  starPoints?: number;
  starInnerRatio?: number;
  crossThickness?: number;
  barThickness?: number;
  customSvgPath?: string;
  glyphSet?: string;

  gap: number; // fraction of cell size
  rotation: number; // degrees, base
  fill: boolean;
  stroke: boolean;
  strokeWidth: number; // fraction of cell size
  strokeColor: string; // hex, or "source" to reuse the cell colour
  background: string;
  transparentBackground: boolean;

  // Sampling
  samplingMode: SamplingMode;
  sampleRadius: number; // multiplier of cell size
  preBlur: number;

  // Color
  color: ColorMode;
  contrast: number;
  brightness: number;

  // Mappings
  sizeMapping: PropertyMapping;
  rotationMapping: PropertyMapping;
  opacityMapping: PropertyMapping;
  strokeWidthMapping: PropertyMapping;
  shapeMapping: PropertyMapping;
}

export type MappingKey =
  | "sizeMapping"
  | "rotationMapping"
  | "opacityMapping"
  | "strokeWidthMapping"
  | "shapeMapping";

/** Linear-light RGBA, all channels in [0, 1]. */
export interface Sample {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Cell {
  index: number;
  x: number;
  y: number;
  size: number;
  /** Extra rotation in degrees baked in by the grid (polar rings, flat hex). */
  orientation: number;
  /** -1 mirrors the primitive vertically; drives triangle tiling. */
  flip: 1 | -1;
  /** Integer grid coordinates, used to index the ordered dither matrix. */
  gx: number;
  gy: number;
}

export interface CellStyle {
  primitive: PrimitiveType;
  scale: number;
  rotation: number;
  opacity: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  /** Only set when `primitive` is "glyph". */
  glyph?: string;
}

export interface RenderStats {
  cells: number;
  ms: number;
  columns: number;
}
