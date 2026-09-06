import type {
  ColorMode,
  Curve,
  FitMode,
  GridType,
  Metric,
  PrimitiveType,
  PropertyMapping,
  RenderConfig,
  SamplingMode,
} from "../types.ts";
import { DEFAULT_CONFIG, mapping } from "./defaults.ts";

/**
 * `RenderConfig` is the preset file *and* the URL state. Both arrive from
 * outside the app, so everything routes through `sanitizeConfig` — a
 * hand-edited hash should produce a boring render, never a broken worker.
 */

const PRIMITIVES: PrimitiveType[] = [
  "square", "circle", "hexagon", "triangle", "diamond", "cross", "hbar",
  "vbar", "star", "polygon", "heart", "ring", "rounded", "glyph", "custom-svg",
];
const GRIDS: GridType[] = [
  "rect", "staggered", "hex", "triangle", "polar", "scatter",
];
const MODES: SamplingMode[] = ["center", "average", "median"];
const FITS: FitMode[] = ["contain", "cover", "stretch"];
const METRIC_NAMES: Metric[] = [
  "luminance", "hue", "saturation", "lightness", "red", "green", "blue",
  "alpha", "distanceFromCenter", "noise", "constant",
];

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
}

function num(v: unknown, def: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}

function oneOf<T extends string>(v: unknown, list: T[], def: T): T {
  return typeof v === "string" && (list as string[]).includes(v)
    ? (v as T)
    : def;
}

const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function hex(v: unknown, def: string): string {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : def;
}

function curve(v: unknown): Curve {
  const c = rec(v);
  switch (c.kind) {
    case "pow":
      return { kind: "pow", gamma: num(c.gamma, 2, 0.05, 20) };
    case "sqrt":
      return { kind: "sqrt" };
    case "smoothstep":
      return { kind: "smoothstep" };
    case "ease": {
      const pt = (p: unknown, dx: number, dy: number): [number, number] => {
        const a = Array.isArray(p) ? p : [];
        return [num(a[0], dx, 0, 1), num(a[1], dy, -2, 3)];
      };
      return { kind: "ease", p1: pt(c.p1, 0.42, 0), p2: pt(c.p2, 0.58, 1) };
    }
    default:
      return { kind: "linear" };
  }
}

function propertyMapping(v: unknown, def: PropertyMapping): PropertyMapping {
  const m = rec(v);
  if (!Object.keys(m).length) return structuredClone(def);
  return mapping({
    enabled: bool(m.enabled, def.enabled),
    metric: oneOf(m.metric, METRIC_NAMES, def.metric),
    invert: bool(m.invert, def.invert),
    curve: "curve" in m ? curve(m.curve) : structuredClone(def.curve),
    min: num(m.min, def.min, -10000, 10000),
    max: num(m.max, def.max, -10000, 10000),
    clamp: bool(m.clamp, def.clamp),
  });
}

function colorMode(v: unknown, def: ColorMode): ColorMode {
  const c = rec(v);
  switch (c.kind) {
    case "grayscale":
      return { kind: "grayscale" };
    case "posterize":
      return { kind: "posterize", levels: Math.round(num(c.levels, 4, 2, 32)) };
    case "quantize":
      return {
        kind: "quantize",
        count: Math.round(num(c.count, 8, 2, 64)),
        dither: bool(c.dither, false),
      };
    case "palette": {
      const raw = Array.isArray(c.colors) ? c.colors : [];
      const colors = raw
        .filter((x): x is string => typeof x === "string" && HEX_RE.test(x.trim()))
        .map((x) => x.trim())
        .slice(0, 64);
      return {
        kind: "palette",
        colors: colors.length ? colors : ["#000000", "#ffffff"],
        dither: bool(c.dither, false),
      };
    }
    case "source":
      return { kind: "source" };
    default:
      return structuredClone(def);
  }
}

export function sanitizeConfig(raw: unknown): RenderConfig {
  const r = rec(raw);
  const d = DEFAULT_CONFIG;
  const shapeSet = Array.isArray(r.shapeSet)
    ? r.shapeSet.filter(
        (x): x is PrimitiveType =>
          typeof x === "string" && (PRIMITIVES as string[]).includes(x),
      )
    : undefined;

  return {
    columns: Math.round(num(r.columns, d.columns, 2, 400)),
    fit: oneOf(r.fit, FITS, d.fit),
    aspect:
      r.aspect === undefined || r.aspect === null
        ? undefined
        : num(r.aspect, 1, 0.1, 10),
    gridType:
      r.gridType === undefined || r.gridType === null
        ? undefined
        : oneOf(r.gridType, GRIDS, "rect"),
    hexOrientation: oneOf(
      r.hexOrientation,
      ["pointy", "flat"] as const,
      d.hexOrientation,
    ),
    rowOffset: num(r.rowOffset, d.rowOffset, -2, 2),
    colOffset: num(r.colOffset, d.colOffset, -2, 2),
    jitter: num(r.jitter, d.jitter, 0, 1),
    seed: Math.round(num(r.seed, d.seed, 0, 2 ** 31 - 1)),
    edge: oneOf(r.edge, ["whole", "bleed"] as const, d.edge),

    primitive: oneOf(r.primitive, PRIMITIVES, d.primitive),
    shapeSet: shapeSet && shapeSet.length ? shapeSet : d.shapeSet,
    polygonSides: Math.round(num(r.polygonSides, 6, 3, 24)),
    starPoints: Math.round(num(r.starPoints, 5, 3, 24)),
    starInnerRatio: num(r.starInnerRatio, 0.4, 0.05, 0.95),
    crossThickness: num(r.crossThickness, 0.3, 0.02, 1),
    barThickness: num(r.barThickness, 0.35, 0.02, 1),
    customSvgPath:
      typeof r.customSvgPath === "string" && r.customSvgPath.length < 200000
        ? r.customSvgPath
        : undefined,
    glyphSet:
      typeof r.glyphSet === "string" && r.glyphSet.length
        ? r.glyphSet.slice(0, 128)
        : d.glyphSet,

    gap: num(r.gap, d.gap, -1, 0.95),
    rotation: num(r.rotation, d.rotation, -360, 360),
    fill: bool(r.fill, d.fill),
    stroke: bool(r.stroke, d.stroke),
    strokeWidth: num(r.strokeWidth, d.strokeWidth, 0, 1),
    strokeColor:
      r.strokeColor === "source" ? "source" : hex(r.strokeColor, d.strokeColor),
    background: hex(r.background, d.background),
    transparentBackground: bool(
      r.transparentBackground,
      d.transparentBackground,
    ),

    samplingMode: oneOf(r.samplingMode, MODES, d.samplingMode),
    sampleRadius: num(r.sampleRadius, d.sampleRadius, 0.25, 8),
    preBlur: num(r.preBlur, d.preBlur, 0, 16),

    color: colorMode(r.color, d.color),
    contrast: num(r.contrast, d.contrast, -0.95, 0.95),
    brightness: num(r.brightness, d.brightness, -2, 2),

    sizeMapping: propertyMapping(r.sizeMapping, d.sizeMapping),
    rotationMapping: propertyMapping(r.rotationMapping, d.rotationMapping),
    opacityMapping: propertyMapping(r.opacityMapping, d.opacityMapping),
    strokeWidthMapping: propertyMapping(
      r.strokeWidthMapping,
      d.strokeWidthMapping,
    ),
    shapeMapping: propertyMapping(r.shapeMapping, d.shapeMapping),
  };
}

/* -------------------------------------------------------------- URL codec */

/** Only what differs from defaults goes in the URL; most hashes stay short. */
function diffFromDefaults(config: RenderConfig): Rec {
  const out: Rec = {};
  for (const k of Object.keys(config) as Array<keyof RenderConfig>) {
    const a = JSON.stringify(config[k]);
    const b = JSON.stringify(DEFAULT_CONFIG[k]);
    if (a !== b && a !== undefined) out[k] = config[k];
  }
  return out;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeConfig(config: RenderConfig): string {
  return toBase64Url(JSON.stringify(diffFromDefaults(config)));
}

export function decodeConfig(encoded: string): RenderConfig | null {
  try {
    return sanitizeConfig(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return null;
  }
}

export function configFromHash(hash: string): RenderConfig | null {
  const m = /(?:^#|[#&])c=([A-Za-z0-9_-]+)/.exec(hash);
  return m ? decodeConfig(m[1]) : null;
}

export function shareUrl(config: RenderConfig): string {
  const base = location.href.split("#")[0];
  return `${base}#c=${encodeConfig(config)}`;
}
