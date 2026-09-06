import type { CustomSvgPayload } from "../worker/protocol.ts";

/**
 * Normalises a user-supplied SVG path into the unit box.
 *
 * The bounding box comes from a real `getBBox()` on a detached SVG element.
 * The alternative — parsing the `d` string and flattening every curve to find
 * extrema — is a few hundred lines to reimplement something the browser
 * already does exactly. The cost is that this must run on the main thread, so
 * the worker receives the path plus a ready-made transform.
 */

let holder: SVGSVGElement | null = null;
let probe: SVGPathElement | null = null;

function ensureProbe(): SVGPathElement {
  if (probe) return probe;
  const NS = "http://www.w3.org/2000/svg";
  holder = document.createElementNS(NS, "svg");
  holder.setAttribute("width", "0");
  holder.setAttribute("height", "0");
  holder.style.cssText =
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  probe = document.createElementNS(NS, "path");
  holder.appendChild(probe);
  document.body.appendChild(holder);
  return probe;
}

/**
 * Accepts either a bare `d` string or a whole SVG document. For a document,
 * every `<path d>` is concatenated into one subpath soup — fine for the icons
 * people actually paste in. Element-level transforms are ignored, which is the
 * one case worth knowing about.
 */
export function extractPathData(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (!text.includes("<")) return /[MmZz]/.test(text) ? text : null;

  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const ds = Array.from(doc.querySelectorAll("path"))
    .map((p) => p.getAttribute("d") ?? "")
    .filter(Boolean);
  return ds.length ? ds.join(" ") : null;
}

export function normalizeSvgPath(input: string): CustomSvgPayload | null {
  const d = extractPathData(input);
  if (!d) return null;

  const path = ensureProbe();
  path.setAttribute("d", d);
  let box: DOMRect;
  try {
    box = path.getBBox();
  } catch {
    return null;
  }
  if (!(box.width > 0) && !(box.height > 0)) return null;

  // Uniform scale on the longer side keeps the artwork's proportions; the
  // shorter side just sits centred with slack.
  const s = 1 / Math.max(box.width, box.height);
  return {
    d,
    norm: {
      s,
      tx: -(box.x + box.width / 2) * s,
      ty: -(box.y + box.height / 2) * s,
    },
  };
}
