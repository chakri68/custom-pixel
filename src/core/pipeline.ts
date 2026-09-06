import type {
  Cell,
  CellStyle,
  PrimitiveType,
  RenderConfig,
  Sample,
} from "../types.ts";
import { clamp } from "./color.ts";
import { buildGrid } from "./grid.ts";
import { applyMapping, mappingUnit, type MetricContext } from "./metrics.ts";
import type { Normalization, ShapeParams } from "./primitives.ts";
import { makeColorResolver } from "./quantize.ts";
import { hash3 } from "./rng.ts";
import {
  blurMip,
  buildMip,
  mipDimsFor,
  sampleBilinear,
  sampleMedian,
  type Mip,
} from "./sampler.ts";
import type { LinearSource } from "./source.ts";

/**
 * The render pass, minus the drawing. Produces the parallel `cells` / `styles`
 * arrays that both the raster renderer and the SVG exporter consume, so vector
 * export never runs a second pass over the image.
 */

/** Below this, the cell is over letterboxing or transparent source: drop it. */
const ALPHA_FLOOR = 0.004;

export interface PipelineInput {
  config: RenderConfig;
  /** Contrast/brightness already applied. */
  source: LinearSource;
  layoutW: number;
  layoutH: number;
  customSvg?: { d: string; norm: Normalization };
}

export interface PipelineResult {
  cells: Cell[];
  styles: CellStyle[];
  shapeParams: ShapeParams;
  palette: string[] | null;
  truncated: boolean;
}

export function shapeParamsOf(
  config: RenderConfig,
  customSvg?: { d: string; norm: Normalization },
): ShapeParams {
  return {
    hexOrientation: config.hexOrientation,
    polygonSides: config.polygonSides ?? 6,
    starPoints: config.starPoints ?? 5,
    starInnerRatio: config.starInnerRatio ?? 0.4,
    crossThickness: config.crossThickness ?? 0.3,
    barThickness: config.barThickness ?? 0.35,
    customSvgD: customSvg?.d,
    customSvgNorm: customSvg?.norm,
  };
}

const DEFAULT_GLYPHS = "@%#*+=-:. ";

export function runPipeline(input: PipelineInput): PipelineResult {
  const { config, source, layoutW, layoutH } = input;

  const { cells, pitch, truncated } = buildGrid(config, layoutW, layoutH);

  // The mip is built unconditionally: `average` samples it, and quantisation
  // derives its palette from it regardless of sampling mode.
  const dims = mipDimsFor(source, pitch, layoutW, layoutH, config.sampleRadius);
  let mip: Mip = buildMip(source, dims.w, dims.h);
  if (config.preBlur > 0) mip = blurMip(mip, config.preBlur);

  const colors = makeColorResolver(config.color, mip);

  const shapeSet: PrimitiveType[] =
    config.shapeMapping.enabled && config.shapeSet && config.shapeSet.length
      ? config.shapeSet
      : [];
  const glyphs = config.glyphSet && config.glyphSet.length
    ? config.glyphSet
    : DEFAULT_GLYPHS;

  const maxDist = Math.hypot(layoutW, layoutH) / 2;
  const cx = layoutW / 2;
  const cy = layoutH / 2;

  // Median works in source pixels, so the cell radius has to travel as UV.
  const ru = (pitch * config.sampleRadius) / 2 / layoutW;
  const rv = (pitch * config.sampleRadius) / 2 / layoutH;

  const sample: Sample = { r: 0, g: 0, b: 0, a: 0 };
  const ctx: MetricContext = { dist: 0, noise: 0 };

  const kept: Cell[] = [];
  const styles: CellStyle[] = [];

  for (const cell of cells) {
    const u = cell.x / layoutW;
    const v = cell.y / layoutH;

    switch (config.samplingMode) {
      case "center":
        sampleBilinear(source.data, source.w, source.h, u, v, sample);
        break;
      case "median":
        sampleMedian(source, u, v, ru, rv, sample);
        break;
      default:
        sampleBilinear(mip.data, mip.w, mip.h, u, v, sample);
    }
    if (sample.a <= ALPHA_FLOOR) continue;

    ctx.dist = Math.min(1, Math.hypot(cell.x - cx, cell.y - cy) / maxDist);
    ctx.noise = hash3(config.seed, cell.index, 4);

    const sizeMul = applyMapping(config.sizeMapping, sample, ctx, 1);
    const scale = cell.size * (1 - config.gap) * sizeMul;
    if (!(scale > 0)) continue;

    const opacity = clamp(
      applyMapping(config.opacityMapping, sample, ctx, 1),
      0,
      1,
    );
    if (opacity <= 0.001) continue;

    const rotation =
      config.rotation +
      cell.orientation +
      applyMapping(config.rotationMapping, sample, ctx, 0);

    const strokeFrac = applyMapping(
      config.strokeWidthMapping,
      sample,
      ctx,
      config.strokeWidth,
    );

    let primitive = config.primitive;
    if (shapeSet.length > 0) {
      const t = mappingUnit(config.shapeMapping, sample, ctx);
      primitive =
        shapeSet[
          Math.min(shapeSet.length - 1, Math.max(0, Math.floor(t * shapeSet.length)))
        ];
    }

    const fillHex = colors.resolve(sample.r, sample.g, sample.b, cell.gx, cell.gy);

    const style: CellStyle = {
      primitive,
      scale,
      rotation,
      opacity,
      strokeWidth: Math.max(0, strokeFrac) * cell.size,
    };
    if (config.fill) style.fill = fillHex;
    if (config.stroke) {
      style.stroke =
        config.strokeColor === "source" ? fillHex : config.strokeColor;
    }
    if (primitive === "glyph") {
      const t = clamp(
        0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b,
        0,
        1,
      );
      style.glyph = glyphs[
        Math.min(glyphs.length - 1, Math.floor(t * glyphs.length))
      ];
    }

    kept.push(cell);
    styles.push(style);
  }

  return {
    cells: kept,
    styles,
    shapeParams: shapeParamsOf(config, input.customSvg),
    palette: colors.palette,
    truncated,
  };
}

/**
 * With a palette in play, sorting by colour collapses thousands of fillStyle
 * assignments (and SVG groups) into a handful. Without one every cell has its
 * own colour, so sorting would only cost time.
 *
 * Both renderers walk this order, which is also what makes the SVG exporter's
 * single-pass `<g fill>` grouping correct.
 */
export function drawOrder(
  styles: CellStyle[],
  palette: string[] | null,
): Int32Array {
  const order = new Int32Array(styles.length);
  for (let i = 0; i < styles.length; i++) order[i] = i;
  if (!palette || palette.length < 2 || styles.length < 2) return order;

  const rank = new Map<string, number>();
  palette.forEach((c, i) => rank.set(c, i));
  const key = (i: number): number => {
    const s = styles[i];
    return (
      (rank.get(s.fill ?? s.stroke ?? "") ?? palette.length) * 1024 +
      Math.round(s.opacity * 1000)
    );
  };
  return order.sort((a, b) => key(a) - key(b));
}
