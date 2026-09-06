import type { CellStyle, RenderConfig } from "../types.ts";
import { drawOrder, type PipelineResult } from "./pipeline.ts";
import { primitiveDef, primitivePath2D } from "./primitives.ts";

const DEG = Math.PI / 180;
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * Where the viewport is looking: `zoom` magnifies and (cx, cy) is the layout
 * point held at the centre of the canvas.
 *
 * This is applied at draw time and nothing else, which is the whole point —
 * zooming re-renders the same cell list at a different magnification instead
 * of re-laying out the grid. Shapes stay crisp at any zoom and the pipeline
 * result stays cached.
 */
export interface ViewTransform {
  zoom: number;
  cx: number;
  cy: number;
}

export function identityView(layoutW: number, layoutH: number): ViewTransform {
  return { zoom: 1, cx: layoutW / 2, cy: layoutH / 2 };
}

/** Collapses view + export scale into one multiply and one offset. */
export function viewMatrix(
  view: ViewTransform | undefined,
  layoutW: number,
  layoutH: number,
  scale: number,
): { z: number; ox: number; oy: number } {
  const v = view ?? identityView(layoutW, layoutH);
  return {
    z: v.zoom * scale,
    ox: (layoutW / 2 - v.cx * v.zoom) * scale,
    oy: (layoutH / 2 - v.cy * v.zoom) * scale,
  };
}

/**
 * Draws a finished `PipelineResult`. `scale` multiplies positions and sizes,
 * which is all an "export at 4x" is — the composition is already decided.
 */
export function drawResult(
  ctx: Ctx,
  result: PipelineResult,
  config: RenderConfig,
  layoutW: number,
  layoutH: number,
  scale: number,
  view?: ViewTransform,
): void {
  const W = Math.round(layoutW * scale);
  const H = Math.round(layoutH * scale);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!config.transparentBackground) {
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.lineJoin = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const { z, ox, oy } = viewMatrix(view, layoutW, layoutH, scale);
  const { cells, styles } = result;
  const order = drawOrder(styles, result.palette);

  // Cache the Path2D per primitive variant; with shape mapping on, styles
  // alternate between primitives every few cells.
  const paths = new Map<string, Path2D | null>();
  const pathFor = (style: CellStyle): Path2D | null => {
    const def = primitiveDef(style.primitive, result.shapeParams);
    if (!def) return null;
    let p = paths.get(def.key);
    if (p === undefined) {
      p = primitivePath2D(def);
      paths.set(def.key, p);
    }
    return p;
  };

  let lastFill = "";
  let lastStroke = "";
  let lastAlpha = -1;
  let lastLine = -1;

  for (const i of order) {
    const cell = cells[i];
    const style = styles[i];
    const s = style.scale * z;
    if (s <= 0) continue;

    if (style.opacity !== lastAlpha) {
      ctx.globalAlpha = style.opacity;
      lastAlpha = style.opacity;
    }
    if (style.fill && style.fill !== lastFill) {
      ctx.fillStyle = style.fill;
      lastFill = style.fill;
    }
    if (style.stroke && style.stroke !== lastStroke) {
      ctx.strokeStyle = style.stroke;
      lastStroke = style.stroke;
    }

    const r = style.rotation * DEG;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const x = cell.x * z + ox;
    const y = cell.y * z + oy;

    if (style.primitive === "glyph") {
      // Glyphs draw at real font size rather than through a scaled transform,
      // so hinting and metrics stay sane.
      ctx.setTransform(cos, sin, -sin * cell.flip, cos * cell.flip, x, y);
      ctx.font = `${s.toFixed(2)}px ui-monospace, "JetBrains Mono", monospace`;
      if (style.fill) ctx.fillText(style.glyph ?? "?", 0, 0);
      if (style.stroke) {
        const lw = style.strokeWidth * z;
        if (lw !== lastLine) {
          ctx.lineWidth = lw;
          lastLine = lw;
        }
        ctx.strokeText(style.glyph ?? "?", 0, 0);
      }
      continue;
    }

    const path = pathFor(style);
    if (!path) continue;

    ctx.setTransform(cos * s, sin * s, -sin * s * cell.flip, cos * s * cell.flip, x, y);
    if (style.fill) ctx.fill(path);
    if (style.stroke) {
      // The transform already scales the stroke, so undo it here. The export
      // scale cancels out: only the shape's own scale matters.
      const lw = style.strokeWidth / style.scale;
      if (lw !== lastLine) {
        ctx.lineWidth = lw;
        lastLine = lw;
      }
      ctx.stroke(path);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

