import type { Store } from "../app/store.ts";
import { DEMO_IMAGES } from "../app/demo.ts";
import { PRESETS } from "../config/presets.ts";
import { button, section, select, type Ui } from "./controls.ts";
import { h } from "./dom.ts";

export interface SourceActions {
  upload: () => void;
  useDemo: (id: string) => void;
  applyPreset: (id: string) => void;
  applyCustomSvg: (text: string) => void;
}

const ASPECTS: Array<{ value: string; label: string }> = [
  { value: "", label: "Source" },
  { value: "1", label: "1:1 square" },
  { value: "0.8", label: "4:5 portrait" },
  { value: "0.7071", label: "A-series portrait" },
  { value: "1.25", label: "5:4 landscape" },
  { value: "1.5", label: "3:2 landscape" },
  { value: "0.6667", label: "2:3 portrait" },
  { value: "1.7778", label: "16:9" },
];

export function buildLeftSidebar(
  ui: Ui,
  store: Store,
  actions: SourceActions,
): { el: HTMLElement; dropzone: HTMLElement; svgStatus: HTMLElement } {
  const dropzone = h("div", { class: "dropzone" }, [
    h("div", { class: "dropzone-title", text: "DROP IMAGE" }),
    h("div", { class: "dropzone-sub", text: "png · jpg · webp" }),
    button("Choose file", actions.upload, "btn primary"),
  ]);

  const demos = h(
    "div",
    { class: "chips" },
    DEMO_IMAGES.map((d) =>
      h("button", {
        class: "chip",
        attr: { type: "button" },
        text: d.name,
        on: { click: () => actions.useDemo(d.id) },
      }),
    ),
  );

  const source = section("SOURCE", [
    dropzone,
    h("div", { class: "row-label", text: "Demo images" }),
    demos,
    select(ui, {
      label: "Fit",
      options: [
        { value: "contain", label: "Contain" },
        { value: "cover", label: "Cover" },
        { value: "stretch", label: "Stretch" },
      ],
      get: () => store.get().fit,
      set: (fit) => store.set({ fit }),
    }),
    select(ui, {
      label: "Output aspect",
      options: ASPECTS,
      get: () => {
        const a = store.get().aspect;
        if (a === undefined) return "";
        const hit = ASPECTS.find(
          (o) => o.value !== "" && Math.abs(Number(o.value) - a) < 0.002,
        );
        return hit?.value ?? "";
      },
      set: (v) => store.set({ aspect: v === "" ? undefined : Number(v) }),
    }),
  ]);

  const presets = section(
    "PRESETS",
    PRESETS.map((p) =>
      h(
        "button",
        {
          class: "preset",
          attr: { type: "button" },
          on: { click: () => actions.applyPreset(p.id) },
        },
        [
          h("span", { class: "preset-name", text: p.name }),
          h("span", { class: "preset-blurb", text: p.blurb }),
        ],
      ),
    ),
  );

  const area = h("textarea", {
    class: "svg-input",
    attr: {
      rows: "4",
      spellcheck: "false",
      "aria-label": "Custom SVG path data",
      placeholder: "M12 2 L22 20 L2 20 Z   — or paste a whole <svg>",
    },
  }) as HTMLTextAreaElement;

  const svgStatus = h("div", { class: "notice" });

  const custom = section("CUSTOM SVG", [
    h("p", {
      class: "card-note",
      text: "Path is normalised to the unit box once, then reused like any built-in primitive.",
    }),
    area,
    button("Use as primitive", () => actions.applyCustomSvg(area.value), "btn primary"),
    svgStatus,
  ]);

  return {
    el: h("aside", { class: "sidebar sidebar-left" }, [source, presets, custom]),
    dropzone,
    svgStatus,
  };
}
