import type { GridType, PrimitiveType } from "../types.ts";

/**
 * Every primitive is one unit-space SVG path string. Path2D is built from the
 * same string the SVG exporter writes out, so raster and vector output are the
 * same geometry by construction — that is the whole reason primitives are
 * path-based. Adding a shape means adding one case below.
 *
 * Shapes fit a 1x1 box centred on the origin, with one deliberate exception:
 * the hexagon is sized flat-to-flat so it tiles its own grid seamlessly at
 * gap 0, which pushes it to 1.1547 across the points.
 */

export interface ShapeParams {
  hexOrientation: "pointy" | "flat";
  polygonSides: number;
  starPoints: number;
  starInnerRatio: number;
  crossThickness: number;
  barThickness: number;
  /** Raw user path plus the transform that lands it in the unit box. */
  customSvgD?: string;
  customSvgNorm?: Normalization;
}

export interface Normalization {
  tx: number;
  ty: number;
  s: number;
}

export interface PrimitiveDef {
  /** Stable id for `<defs>` dedupe and Path2D caching. */
  key: string;
  d: string;
  /** Applied inside the symbol, before per-cell transforms. */
  norm?: Normalization;
}

const DEFAULT_GRIDS: Record<PrimitiveType, GridType> = {
  square: "rect",
  circle: "rect",
  hexagon: "hex",
  triangle: "triangle",
  diamond: "rect",
  cross: "rect",
  hbar: "rect",
  vbar: "rect",
  star: "rect",
  polygon: "rect",
  heart: "rect",
  ring: "rect",
  rounded: "rect",
  glyph: "rect",
  "custom-svg": "rect",
};

export function defaultGridFor(p: PrimitiveType): GridType {
  return DEFAULT_GRIDS[p];
}

export const PRIMITIVE_LABELS: Record<PrimitiveType, string> = {
  square: "Square",
  circle: "Circle",
  hexagon: "Hexagon",
  triangle: "Triangle",
  diamond: "Diamond",
  cross: "Cross",
  hbar: "Bar (H)",
  vbar: "Bar (V)",
  star: "Star",
  polygon: "Polygon",
  heart: "Heart",
  ring: "Ring",
  rounded: "Rounded sq",
  glyph: "Glyph",
  "custom-svg": "Custom SVG",
};

/** Primitives offered in the shape-set picker (glyph/custom need extra config). */
export const SHAPE_SET_CHOICES: PrimitiveType[] = [
  "square",
  "circle",
  "hexagon",
  "triangle",
  "diamond",
  "cross",
  "hbar",
  "vbar",
  "star",
  "polygon",
  "heart",
  "ring",
  "rounded",
];

/* ------------------------------------------------------------- geometry */

/** Trims float noise out of emitted path data; SVG files get big fast. */
function n(v: number): string {
  const r = Math.round(v * 100000) / 100000;
  return Object.is(r, -0) ? "0" : String(r);
}

function polyPath(points: Array<[number, number]>): string {
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${n(points[i][0])} ${n(points[i][1])}`;
  }
  return d + "Z";
}

function regularPolygon(
  sides: number,
  radius: number,
  startDeg: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts;
}

/** Full circle as two arcs. `sweep` flips winding so a ring can subtract. */
function circlePath(r: number, sweep: 0 | 1): string {
  return (
    `M${n(-r)} 0A${n(r)} ${n(r)} 0 1 ${sweep} ${n(r)} 0` +
    `A${n(r)} ${n(r)} 0 1 ${sweep} ${n(-r)} 0Z`
  );
}

function rectPath(w: number, h: number): string {
  return polyPath([
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]);
}

function crossPath(t: number): string {
  const a = t / 2;
  const b = 0.5;
  return polyPath([
    [-a, -b],
    [a, -b],
    [a, -a],
    [b, -a],
    [b, a],
    [a, a],
    [a, b],
    [-a, b],
    [-a, a],
    [-b, a],
    [-b, -a],
    [-a, -a],
  ]);
}

function starPath(points: number, innerRatio: number): string {
  const outer = 0.5;
  const inner = outer * Math.min(0.95, Math.max(0.05, innerRatio));
  const pts: Array<[number, number]> = [];
  const step = 180 / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + step * i) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polyPath(pts);
}

function roundedPath(r: number): string {
  const e = 0.5;
  return (
    `M${n(-e + r)} ${n(-e)}` +
    `H${n(e - r)}A${n(r)} ${n(r)} 0 0 1 ${n(e)} ${n(-e + r)}` +
    `V${n(e - r)}A${n(r)} ${n(r)} 0 0 1 ${n(e - r)} ${n(e)}` +
    `H${n(-e + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-e)} ${n(e - r)}` +
    `V${n(-e + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-e + r)} ${n(-e)}Z`
  );
}

// Two mirrored cubics meeting at the cleft and the point.
const HEART_D =
  "M0 0.46C-0.62 0.04-0.5-0.46-0.22-0.46C-0.07-0.46 0-0.34 0-0.26" +
  "C0-0.34 0.07-0.46 0.22-0.46C0.5-0.46 0.62 0.04 0 0.46Z";

const SQRT3 = Math.sqrt(3);

/* --------------------------------------------------------------- registry */

const cache = new Map<string, PrimitiveDef>();

/** Identifies a primitive *variant* — a 7-point star differs from a 5-point one. */
export function primitiveKey(type: PrimitiveType, p: ShapeParams): string {
  switch (type) {
    case "hexagon":
      return `hexagon-${p.hexOrientation}`;
    case "star":
      return `star-${p.starPoints}-${p.starInnerRatio}`;
    case "polygon":
      return `polygon-${p.polygonSides}`;
    case "cross":
      return `cross-${p.crossThickness}`;
    case "hbar":
    case "vbar":
      return `${type}-${p.barThickness}`;
    case "custom-svg":
      return "custom";
    default:
      return type;
  }
}

/** Returns null for `glyph`, which is drawn with fillText, not a path. */
export function primitiveDef(
  type: PrimitiveType,
  p: ShapeParams,
): PrimitiveDef | null {
  if (type === "glyph") return null;
  const key = primitiveKey(type, p);
  const hit = cache.get(key);
  if (hit) return hit;

  let d: string;
  let norm: Normalization | undefined;

  switch (type) {
    case "square":
      d = rectPath(1, 1);
      break;
    case "circle":
      d = circlePath(0.5, 0);
      break;
    case "hexagon": {
      // Circumradius 1/sqrt(3) puts the flats exactly 1 apart, which is what
      // the hex grid steps by. Pointy-top has a vertex at -90deg.
      const r = 1 / SQRT3;
      d = polyPath(
        regularPolygon(6, r, p.hexOrientation === "pointy" ? -90 : 0),
      );
      break;
    }
    case "triangle":
      // Base 1, height sqrt(3)/2, centred on its bounding box so that a
      // vertical mirror is the exact complement — that is what tiles.
      d = polyPath([
        [0, -SQRT3 / 4],
        [0.5, SQRT3 / 4],
        [-0.5, SQRT3 / 4],
      ]);
      break;
    case "diamond":
      d = polyPath([
        [0, -0.5],
        [0.5, 0],
        [0, 0.5],
        [-0.5, 0],
      ]);
      break;
    case "cross":
      d = crossPath(p.crossThickness);
      break;
    case "hbar":
      d = rectPath(1, p.barThickness);
      break;
    case "vbar":
      d = rectPath(p.barThickness, 1);
      break;
    case "star":
      d = starPath(Math.max(3, Math.round(p.starPoints)), p.starInnerRatio);
      break;
    case "polygon":
      d = polyPath(
        regularPolygon(Math.max(3, Math.round(p.polygonSides)), 0.5, -90),
      );
      break;
    case "heart":
      d = HEART_D;
      break;
    case "ring":
      // Opposite sweep on the inner circle: non-zero winding hollows it out,
      // which keeps canvas and SVG agreeing without a fill-rule attribute.
      d = circlePath(0.5, 0) + circlePath(0.3, 1);
      break;
    case "rounded":
      d = roundedPath(0.18);
      break;
    case "custom-svg":
      if (!p.customSvgD) return null;
      d = p.customSvgD;
      norm = p.customSvgNorm;
      break;
  }

  const def: PrimitiveDef = norm ? { key, d, norm } : { key, d };
  // Custom paths change under the same key, so they are never cached.
  if (type !== "custom-svg") cache.set(key, def);
  return def;
}

/* ------------------------------------------------- Path2D materialisation */

const pathCache = new Map<string, Path2D>();

export function primitivePath2D(def: PrimitiveDef): Path2D {
  const ck = def.norm
    ? `${def.key}|${def.norm.tx},${def.norm.ty},${def.norm.s}|${def.d}`
    : def.key;
  const hit = pathCache.get(ck);
  if (hit) return hit;
  let path = new Path2D(def.d);
  if (def.norm) {
    const wrapped = new Path2D();
    const { tx, ty, s } = def.norm;
    wrapped.addPath(path, new DOMMatrix([s, 0, 0, s, tx, ty]));
    path = wrapped;
  }
  // Unbounded growth is not a risk: keys are a small fixed set plus the one
  // live custom path, which we evict as soon as it changes.
  if (pathCache.size > 64) pathCache.clear();
  pathCache.set(ck, path);
  return path;
}
