import type { CellStyle, RenderConfig } from "../types.ts";
import { drawOrder, type PipelineResult } from "./pipeline.ts";
import { primitiveDef } from "./primitives.ts";

/**
 * SVG export. Serialises the same `cells`/`styles` arrays the raster pass
 * drew, so there is no second render and no chance of the two diverging.
 *
 * Deviation from the spec worth knowing about: shapes go into `<defs>` as
 * `<path id>` rather than `<symbol>`. Same structure, same one-def-per-
 * primitive, but a symbol without a viewBox needs `overflow:visible` to avoid
 * clipping and Illustrator handles that inconsistently. `<use>` on a path is
 * boring and works everywhere.
 */

export function renderSvg(
  result: PipelineResult,
  config: RenderConfig,
  layoutW: number,
  layoutH: number,
  scale: number,
): string {
  const W = round(layoutW * scale, 2);
  const H = round(layoutH * scale, 2);
  const { cells, styles } = result;

  // One def per primitive variant actually used.
  const defs: string[] = [];
  const defIds = new Map<string, string>();
  for (const style of styles) {
    if (style.primitive === "glyph") continue;
    const def = primitiveDef(style.primitive, result.shapeParams);
    if (!def || defIds.has(def.key)) continue;
    const id = `s-${def.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    defIds.set(def.key, id);
    defs.push(
      def.norm
        ? `<g id="${id}" transform="translate(${round(def.norm.tx, 5)} ${round(
            def.norm.ty,
            5,
          )}) scale(${round(def.norm.s, 6)})"><path d="${def.d}"/></g>`
        : `<path id="${id}" d="${def.d}"/>`,
    );
  }

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
      `viewBox="0 0 ${W} ${H}" shape-rendering="geometricPrecision">`,
  );
  if (!config.transparentBackground) {
    out.push(`<rect width="${W}" height="${H}" fill="${config.background}"/>`);
  }
  if (defs.length) out.push(`<defs>${defs.join("")}</defs>`);

  const grouped = result.palette !== null && result.palette.length >= 2;
  let openKey: string | null = null;

  for (const i of drawOrder(styles, result.palette)) {
    const style = styles[i];
    const cell = cells[i];
    const s = style.scale * scale;
    if (s <= 0) continue;

    // The shared draw order is palette-sorted, so same-colour cells are
    // contiguous and grouping is a single pass with no extra bookkeeping.
    if (grouped) {
      const k = groupKey(style);
      if (k !== openKey) {
        if (openKey !== null) out.push("</g>");
        out.push(`<g${groupAttrs(style)}>`);
        openKey = k;
      }
    }

    const transform =
      `translate(${round(cell.x * scale, 2)} ${round(cell.y * scale, 2)})` +
      (style.rotation ? ` rotate(${round(style.rotation, 3)})` : "");

    if (style.primitive === "glyph") {
      out.push(
        `<text ${transform ? `transform="${transform}"` : ""}` +
          ` font-family="monospace" font-size="${round(s, 3)}"` +
          ` text-anchor="middle" dominant-baseline="central"` +
          `${grouped ? "" : cellAttrs(style)}>${escapeXml(style.glyph ?? "?")}</text>`,
      );
      continue;
    }

    const def = primitiveDef(style.primitive, result.shapeParams);
    const id = def && defIds.get(def.key);
    if (!id) continue;

    const sy = round(s * cell.flip, 4);
    const sx = round(s, 4);
    const scaleAttr = sx === sy ? `scale(${sx})` : `scale(${sx} ${sy})`;
    const strokeAttr = style.stroke
      ? ` stroke-width="${round(style.strokeWidth / style.scale, 5)}"`
      : "";
    out.push(
      `<use href="#${id}" transform="${transform} ${scaleAttr}"` +
        `${grouped ? "" : cellAttrs(style)}${strokeAttr}/>`,
    );
  }

  if (openKey !== null) out.push("</g>");
  out.push("</svg>");
  return out.join("\n");
}

function groupKey(s: CellStyle): string {
  return `${s.fill ?? "-"}|${s.stroke ?? "-"}|${s.opacity.toFixed(3)}`;
}

function groupAttrs(s: CellStyle): string {
  let a = ` fill="${s.fill ?? "none"}"`;
  if (s.stroke) a += ` stroke="${s.stroke}"`;
  if (s.opacity < 0.999) a += ` opacity="${round(s.opacity, 3)}"`;
  return a;
}

function cellAttrs(s: CellStyle): string {
  let a = ` fill="${s.fill ?? "none"}"`;
  if (s.stroke) a += ` stroke="${s.stroke}"`;
  if (s.opacity < 0.999) a += ` opacity="${round(s.opacity, 3)}"`;
  return a;
}

function round(v: number, places: number): number {
  const f = 10 ** places;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] ?? c,
  );
}
