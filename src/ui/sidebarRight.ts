import type { Store } from "../app/store.ts";
import { PRIMITIVE_LABELS } from "../core/primitives.ts";
import type {
  ColorModeKind,
  GridType,
  PrimitiveType,
  SamplingMode,
} from "../types.ts";
import {
  button,
  colorInput,
  numberInput,
  section,
  select,
  slider,
  textInput,
  toggle,
  type Ui,
} from "./controls.ts";
import { h } from "./dom.ts";
import { mappingCard } from "./mappingCard.ts";
import { derivedPaletteStrip, paletteEditor } from "./paletteEditor.ts";

export interface ExportActions {
  raster: (scale: number, format: "png" | "jpeg") => void;
  svg: (scale: number) => void;
  savePreset: () => void;
  loadPreset: () => void;
  copyShare: () => void;
}

const PRIMITIVE_ORDER: PrimitiveType[] = [
  "square", "circle", "hexagon", "triangle", "diamond", "cross", "hbar",
  "vbar", "star", "polygon", "heart", "ring", "rounded", "glyph", "custom-svg",
];

const GRID_LABELS: Record<GridType, string> = {
  rect: "Rectangular",
  staggered: "Staggered",
  hex: "Hexagonal",
  triangle: "Triangular",
  polar: "Polar rings",
  scatter: "Scatter",
};

export function buildRightSidebar(
  ui: Ui,
  store: Store,
  derived: () => string[] | null,
  actions: ExportActions,
): HTMLElement {
  const cfg = () => store.get();
  const usesShape = (p: PrimitiveType): boolean =>
    cfg().primitive === p ||
    (cfg().shapeMapping.enabled && (cfg().shapeSet ?? []).includes(p));

  /* ------------------------------------------------------------- shape */

  const shape = section("SHAPE", [
    select(ui, {
      label: "Primitive",
      options: PRIMITIVE_ORDER.map((p) => ({
        value: p,
        label: PRIMITIVE_LABELS[p],
      })),
      get: () => cfg().primitive,
      set: (primitive) => store.set({ primitive }),
    }),
    slider(ui, {
      label: "Polygon sides",
      showIf: () => usesShape("polygon"),
      min: 3, max: 16, step: 1,
      get: () => cfg().polygonSides ?? 6,
      set: (v) => store.set({ polygonSides: v }),
    }),
    slider(ui, {
      label: "Star points",
      showIf: () => usesShape("star"),
      min: 3, max: 16, step: 1,
      get: () => cfg().starPoints ?? 5,
      set: (v) => store.set({ starPoints: v }),
    }),
    slider(ui, {
      label: "Star inner ratio",
      showIf: () => usesShape("star"),
      min: 0.05, max: 0.95, step: 0.01,
      get: () => cfg().starInnerRatio ?? 0.4,
      set: (v) => store.set({ starInnerRatio: v }),
    }),
    slider(ui, {
      label: "Cross thickness",
      showIf: () => usesShape("cross"),
      min: 0.05, max: 1, step: 0.01,
      get: () => cfg().crossThickness ?? 0.3,
      set: (v) => store.set({ crossThickness: v }),
    }),
    slider(ui, {
      label: "Bar thickness",
      showIf: () => usesShape("hbar") || usesShape("vbar"),
      min: 0.02, max: 1, step: 0.01,
      get: () => cfg().barThickness ?? 0.35,
      set: (v) => store.set({ barThickness: v }),
    }),
    textInput(ui, {
      label: "Glyph ramp",
      hint: "Ordered dark to light",
      showIf: () => usesShape("glyph"),
      placeholder: "@%#*+=-:. ",
      get: () => cfg().glyphSet ?? "",
      set: (v) => store.set({ glyphSet: v }),
    }),
    slider(ui, {
      label: "Gap",
      hint: "Fraction of the cell; negative overlaps",
      min: -0.4, max: 0.9, step: 0.01,
      get: () => cfg().gap,
      set: (v) => store.set({ gap: v }),
    }),
    slider(ui, {
      label: "Base rotation",
      min: -180, max: 180, step: 1,
      format: (v) => `${Math.round(v)}°`,
      get: () => cfg().rotation,
      set: (v) => store.set({ rotation: v }),
    }),
    toggle(ui, {
      label: "Fill",
      get: () => cfg().fill,
      set: (v) => store.set({ fill: v }),
    }),
    toggle(ui, {
      label: "Stroke",
      get: () => cfg().stroke,
      set: (v) => store.set({ stroke: v }),
    }),
    slider(ui, {
      label: "Stroke width",
      hint: "Fraction of the cell size",
      showIf: () => cfg().stroke,
      min: 0, max: 0.4, step: 0.002,
      get: () => cfg().strokeWidth,
      set: (v) => store.set({ strokeWidth: v }),
    }),
    colorInput(ui, {
      label: "Stroke colour",
      showIf: () => cfg().stroke,
      allowSource: true,
      get: () => cfg().strokeColor,
      set: (v) => store.set({ strokeColor: v }),
    }),
    colorInput(ui, {
      label: "Background",
      showIf: () => !cfg().transparentBackground,
      get: () => cfg().background,
      set: (v) => store.set({ background: v }),
    }),
    toggle(ui, {
      label: "Transparent bg",
      get: () => cfg().transparentBackground,
      set: (v) => store.set({ transparentBackground: v }),
    }),
  ]);

  /* -------------------------------------------------------------- grid */

  const grid = section("GRID", [
    slider(ui, {
      label: "Columns",
      hint: "Cells across. Cell size is derived, so export scale is free.",
      min: 4, max: 300, step: 1,
      format: (v) => String(Math.round(v)),
      get: () => cfg().columns,
      set: (v) => store.set({ columns: Math.round(v) }),
    }),
    select(ui, {
      label: "Grid type",
      options: [
        { value: "", label: "Auto (from shape)" },
        ...(Object.keys(GRID_LABELS) as GridType[]).map((g) => ({
          value: g,
          label: GRID_LABELS[g],
        })),
      ],
      get: () => cfg().gridType ?? "",
      set: (v) => store.set({ gridType: v === "" ? undefined : (v as GridType) }),
    }),
    select(ui, {
      label: "Hex orientation",
      showIf: () =>
        (cfg().gridType ?? (cfg().primitive === "hexagon" ? "hex" : "rect")) ===
          "hex" || cfg().primitive === "hexagon",
      options: [
        { value: "pointy", label: "Pointy top" },
        { value: "flat", label: "Flat top" },
      ],
      get: () => cfg().hexOrientation,
      set: (v) => store.set({ hexOrientation: v }),
    }),
    select(ui, {
      label: "Edge",
      hint: "Whole trims to complete shapes; bleed lets them run off",
      options: [
        { value: "whole", label: "Whole cells" },
        { value: "bleed", label: "Bleed off canvas" },
      ],
      get: () => cfg().edge,
      set: (edge) => store.set({ edge }),
    }),
    slider(ui, {
      label: "Column offset",
      min: -1, max: 1, step: 0.01,
      get: () => cfg().colOffset,
      set: (v) => store.set({ colOffset: v }),
    }),
    slider(ui, {
      label: "Row offset",
      min: -1, max: 1, step: 0.01,
      get: () => cfg().rowOffset,
      set: (v) => store.set({ rowOffset: v }),
    }),
    slider(ui, {
      label: "Jitter",
      hint: "Seeded, so presets and shared URLs reproduce exactly",
      min: 0, max: 1, step: 0.01,
      get: () => cfg().jitter,
      set: (v) => store.set({ jitter: v }),
    }),
    numberInput(ui, {
      label: "Seed",
      min: 0, step: 1,
      get: () => cfg().seed,
      set: (v) => store.set({ seed: Math.max(0, Math.round(v)) }),
    }),
    button("Randomise seed", () =>
      store.set({ seed: Math.floor(Math.random() * 2 ** 31) }),
    ),
  ]);

  /* ---------------------------------------------------------- sampling */

  const sampling = section("SAMPLING", [
    select(ui, {
      label: "Mode",
      options: [
        { value: "average", label: "Average (mip)" },
        { value: "center", label: "Centre" },
        { value: "median", label: "Median — slow" },
      ] as Array<{ value: SamplingMode; label: string }>,
      get: () => cfg().samplingMode,
      set: (v) => store.set({ samplingMode: v }),
    }),
    slider(ui, {
      label: "Sample radius",
      hint: "Over-sample beyond the cell for smoother results",
      min: 0.25, max: 4, step: 0.05,
      get: () => cfg().sampleRadius,
      set: (v) => store.set({ sampleRadius: v }),
    }),
    slider(ui, {
      label: "Pre-blur",
      min: 0, max: 8, step: 1,
      get: () => cfg().preBlur,
      set: (v) => store.set({ preBlur: v }),
    }),
    h("p", {
      class: "card-note",
      text: "Median is skipped while you drag a control, then applied on release.",
    }),
  ]);

  /* ----------------------------------------------------------- mapping */

  const mapping = section("MAPPING", [
    h("p", {
      class: "card-note",
      text: "metric → invert → curve → lerp(min,max) → clamp",
    }),
    mappingCard(ui, store, {
      key: "sizeMapping",
      title: "Size",
      units: "×scale",
      note: "Halftone wants sqrt: perceived darkness follows area, not radius.",
    }),
    mappingCard(ui, store, {
      key: "rotationMapping",
      title: "Rotation",
      units: "degrees",
      step: 1,
    }),
    mappingCard(ui, store, {
      key: "opacityMapping",
      title: "Opacity",
      units: "0–1",
    }),
    mappingCard(ui, store, {
      key: "strokeWidthMapping",
      title: "Stroke width",
      units: "×cell",
      step: 0.005,
    }),
    mappingCard(ui, store, {
      key: "shapeMapping",
      title: "Shape",
      units: "index",
      note: "The metric is bucketed evenly across the shape set.",
    }),
  ]);

  /* ------------------------------------------------------------- colour */

  const color = section("COLOUR", [
    select(ui, {
      label: "Mode",
      options: [
        { value: "source", label: "Source colours" },
        { value: "grayscale", label: "Grayscale" },
        { value: "quantize", label: "Quantize to N" },
        { value: "palette", label: "User palette" },
        { value: "posterize", label: "Posterize" },
      ] as Array<{ value: ColorModeKind; label: string }>,
      get: () => cfg().color.kind,
      set: (kind) => {
        if (kind === cfg().color.kind) return;
        store.set({
          color:
            kind === "quantize"
              ? { kind, count: 8, dither: false }
              : kind === "palette"
                ? {
                    kind,
                    colors: derived() ?? ["#0b0b0a", "#ffb000", "#ece7da"],
                    dither: false,
                  }
                : kind === "posterize"
                  ? { kind, levels: 4 }
                  : { kind },
        });
      },
    }),
    slider(ui, {
      label: "Colours",
      showIf: () => cfg().color.kind === "quantize",
      min: 2, max: 48, step: 1,
      format: (v) => String(Math.round(v)),
      get: () => {
        const c = cfg().color;
        return c.kind === "quantize" ? c.count : 8;
      },
      set: (v) => {
        const c = cfg().color;
        if (c.kind === "quantize") {
          store.set({ color: { ...c, count: Math.round(v) } });
        }
      },
    }),
    slider(ui, {
      label: "Levels",
      showIf: () => cfg().color.kind === "posterize",
      min: 2, max: 16, step: 1,
      format: (v) => String(Math.round(v)),
      get: () => {
        const c = cfg().color;
        return c.kind === "posterize" ? c.levels : 4;
      },
      set: (v) => store.set({ color: { kind: "posterize", levels: Math.round(v) } }),
    }),
    toggle(ui, {
      label: "Ordered dither",
      hint: "Bayer 4×4, applied per cell",
      showIf: () =>
        cfg().color.kind === "quantize" || cfg().color.kind === "palette",
      get: () => {
        const c = cfg().color;
        return (c.kind === "quantize" || c.kind === "palette") && c.dither;
      },
      set: (dither) => {
        const c = cfg().color;
        if (c.kind === "quantize" || c.kind === "palette") {
          store.set({ color: { ...c, dither } });
        }
      },
    }),
    derivedPaletteStrip(ui, store, derived),
    paletteEditor(ui, store, derived),
    slider(ui, {
      label: "Contrast",
      hint: "Applied in linear light, before sampling",
      min: -0.9, max: 0.9, step: 0.01,
      get: () => cfg().contrast,
      set: (v) => store.set({ contrast: v }),
    }),
    slider(ui, {
      label: "Brightness",
      hint: "Exposure, in stops",
      min: -2, max: 2, step: 0.05,
      get: () => cfg().brightness,
      set: (v) => store.set({ brightness: v }),
    }),
  ]);

  /* ------------------------------------------------------------- export */

  let scale = 2;
  const scaleRow = select(ui, {
    label: "Scale",
    options: [
      { value: "1", label: "1× (preview)" },
      { value: "2", label: "2×" },
      { value: "4", label: "4×" },
    ],
    get: () => String(scale),
    set: (v) => {
      scale = Number(v);
    },
  });

  const exportSection = section("EXPORT", [
    scaleRow,
    h("div", { class: "btn-row" }, [
      button("PNG", () => actions.raster(scale, "png"), "btn primary"),
      button("JPG", () => actions.raster(scale, "jpeg")),
      button("SVG", () => actions.svg(scale)),
    ]),
    h("p", {
      class: "card-note",
      text: "SVG is one <use> per cell, grouped by palette colour. Editable in Illustrator or Inkscape.",
    }),
    h("div", { class: "btn-row" }, [
      button("Save preset", actions.savePreset),
      button("Load preset", actions.loadPreset),
    ]),
    button("Copy share URL", actions.copyShare, "add-rule"),
  ]);

  return h("aside", { class: "sidebar", attr: { id: "sidebar" } }, [
    shape,
    grid,
    sampling,
    mapping,
    color,
    exportSection,
  ]);
}
