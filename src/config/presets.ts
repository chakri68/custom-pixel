import type { RenderConfig } from "../types.ts";
import { DEFAULT_CONFIG, mapping } from "./defaults.ts";

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  config: RenderConfig;
}

function preset(over: Partial<RenderConfig>): RenderConfig {
  return structuredClone({ ...DEFAULT_CONFIG, ...over });
}

export const PRESETS: Preset[] = [
  {
    id: "honeycomb",
    name: "Honeycomb portrait",
    blurb: "Tight hex packing, source colour, no gaps",
    config: preset({
      primitive: "hexagon",
      gridType: "hex",
      columns: 72,
      gap: 0.03,
      background: "#0b0b0a",
    }),
  },
  {
    id: "halftone",
    name: "Dot halftone",
    blurb: "Area-correct: radius tracks the square root of darkness",
    config: preset({
      primitive: "circle",
      gridType: "rect",
      columns: 80,
      gap: 0,
      background: "#ece7da",
      color: { kind: "palette", colors: ["#0b0b0a"], dither: false },
      // Perceived darkness goes with area, not radius, so the sqrt curve is
      // what makes the greys come out right.
      sizeMapping: mapping({
        enabled: true,
        metric: "luminance",
        invert: true,
        curve: { kind: "sqrt" },
        min: 0,
        max: 1.2,
      }),
    }),
  },
  {
    id: "triangles",
    name: "Triangle mosaic",
    blurb: "Alternating equilateral tiling, low-poly feel",
    config: preset({
      primitive: "triangle",
      gridType: "triangle",
      columns: 52,
      gap: 0,
      background: "#0b0b0a",
    }),
  },
  {
    id: "diamond-poster",
    name: "Diamond poster",
    blurb: "Six-colour palette, ordered dither",
    config: preset({
      primitive: "diamond",
      gridType: "staggered",
      columns: 64,
      gap: 0.06,
      brightness: 0.25,
      background: "#0b0b0a",
      color: {
        kind: "palette",
        colors: [
          "#0b0b0a",
          "#3d2a12",
          "#8b5a1a",
          "#ffb000",
          "#ffd98a",
          "#ece7da",
        ],
        dither: true,
      },
    }),
  },
  {
    id: "glyph",
    name: "Retro glyph render",
    blurb: "Amber-on-black ASCII, density carries the tone",
    config: preset({
      primitive: "glyph",
      gridType: "rect",
      columns: 110,
      gap: 0,
      // Reversed against the default ramp: amber ink on black wants the dense
      // glyphs on the *bright* end, or the render comes out as a negative.
      glyphSet: " .:-=+*#%@",
      background: "#000000",
      color: { kind: "palette", colors: ["#ffb000"], dither: false },
    }),
  },
  {
    id: "minimal",
    name: "Minimal geometric print",
    blurb: "Stroke only, line weight driven by darkness",
    config: preset({
      primitive: "polygon",
      polygonSides: 6,
      gridType: "staggered",
      columns: 34,
      gap: 0.18,
      fill: false,
      stroke: true,
      strokeColor: "#0b0b0a",
      strokeWidth: 0.05,
      background: "#ece7da",
      contrast: 0.25,
      brightness: 0.3,
      // Not inverted: the lit subject carries the line weight and the
      // background thins out to hairlines. Inverted puts all the ink on the
      // backdrop, which reads as texture rather than a portrait.
      strokeWidthMapping: mapping({
        enabled: true,
        metric: "luminance",
        curve: { kind: "pow", gamma: 1.4 },
        min: 0.004,
        max: 0.16,
      }),
    }),
  },
];
