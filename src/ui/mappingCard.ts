import type { Store } from "../app/store.ts";
import { METRIC_LABELS, METRICS } from "../core/metrics.ts";
import { PRIMITIVE_LABELS, SHAPE_SET_CHOICES } from "../core/primitives.ts";
import type { CurveKind, MappingKey, PrimitiveType } from "../types.ts";
import {
  numberInput,
  select,
  slider,
  toggle,
  type Ui,
} from "./controls.ts";
import { clear, h } from "./dom.ts";

/**
 * One mapping = one metric driving one property through
 * `metric -> [invert] -> curve -> lerp(min,max) -> [clamp]`. All five cards
 * are the same component; `shapeMapping` swaps the min/max pair for a shape
 * set editor because it buckets rather than lerps.
 */

const CURVES: Array<{ value: CurveKind; label: string }> = [
  { value: "linear", label: "Linear" },
  { value: "pow", label: "Power (γ)" },
  { value: "sqrt", label: "Sqrt" },
  { value: "smoothstep", label: "Smoothstep" },
  { value: "ease", label: "Ease (4-point)" },
];

export interface MappingCardOpts {
  key: MappingKey;
  title: string;
  units: string;
  step?: number;
  note?: string;
}

export function mappingCard(
  ui: Ui,
  store: Store,
  o: MappingCardOpts,
): HTMLElement {
  const get = () => store.get()[o.key];
  const patch = (p: Partial<ReturnType<typeof get>>): void =>
    store.setMapping(o.key, p);

  const head = h("div", { class: "card-head" }, [
    h("span", { class: "card-title", text: o.title }),
    h("span", { class: "card-units", text: o.units }),
  ]);

  const enabled = toggle(ui, {
    label: "Enabled",
    get: () => get().enabled,
    set: (v) => patch({ enabled: v }),
  });

  const isShape = o.key === "shapeMapping";
  const on = (): boolean => get().enabled;

  const body = h("div", { class: "card-body" }, [
    select(ui, {
      label: "Metric",
      showIf: on,
      options: METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] })),
      get: () => get().metric,
      set: (v) => patch({ metric: v }),
    }),
    toggle(ui, {
      label: "Invert",
      showIf: on,
      get: () => get().invert,
      set: (v) => patch({ invert: v }),
    }),
    select(ui, {
      label: "Curve",
      showIf: on,
      options: CURVES,
      get: () => get().curve.kind,
      set: (kind) => {
        const cur = get().curve;
        if (kind === cur.kind) return;
        patch({
          curve:
            kind === "pow"
              ? { kind: "pow", gamma: 2 }
              : kind === "ease"
                ? { kind: "ease", p1: [0.42, 0], p2: [0.58, 1] }
                : { kind },
        });
      },
    }),
    slider(ui, {
      label: "Gamma",
      showIf: () => on() && get().curve.kind === "pow",
      min: 0.1,
      max: 6,
      step: 0.05,
      get: () => {
        const c = get().curve;
        return c.kind === "pow" ? c.gamma : 2;
      },
      set: (gamma) => patch({ curve: { kind: "pow", gamma } }),
    }),
    easeEditor(ui, store, o.key, on),
    ...(isShape
      ? [shapeSetEditor(ui, store, on)]
      : [
          numberInput(ui, {
            label: "Min",
            showIf: on,
            step: o.step ?? 0.01,
            get: () => get().min,
            set: (v) => patch({ min: v }),
          }),
          numberInput(ui, {
            label: "Max",
            showIf: on,
            step: o.step ?? 0.01,
            get: () => get().max,
            set: (v) => patch({ max: v }),
          }),
          toggle(ui, {
            label: "Clamp",
            showIf: on,
            get: () => get().clamp,
            set: (v) => patch({ clamp: v }),
          }),
        ]),
    o.note ? h("p", { class: "card-note", text: o.note }) : null,
  ].filter((x): x is HTMLElement => x !== null));

  const card = h("div", { class: "card" }, [head, enabled, body]);
  ui.register(() => card.classList.toggle("card-on", get().enabled));
  return card;
}

/** Four numbers is a clumsy way to draw a bezier, but it is honest and small. */
function easeEditor(
  ui: Ui,
  store: Store,
  key: MappingKey,
  on: () => boolean,
): HTMLElement {
  const show = (): boolean => on() && store.get()[key].curve.kind === "ease";
  const pts = (): { p1: [number, number]; p2: [number, number] } => {
    const c = store.get()[key].curve;
    return c.kind === "ease"
      ? { p1: c.p1, p2: c.p2 }
      : { p1: [0.42, 0], p2: [0.58, 1] };
  };
  const setPt = (which: "p1" | "p2", i: 0 | 1, v: number): void => {
    const cur = pts();
    const next = { ...cur, [which]: [...cur[which]] as [number, number] };
    next[which][i] = v;
    store.setMapping(key, { curve: { kind: "ease", ...next } });
  };

  const fields: HTMLElement[] = [];
  for (const which of ["p1", "p2"] as const) {
    for (const i of [0, 1] as const) {
      fields.push(
        numberInput(ui, {
          label: `${which}.${i === 0 ? "x" : "y"}`,
          showIf: show,
          step: 0.01,
          get: () => pts()[which][i],
          set: (v) => setPt(which, i, v),
        }),
      );
    }
  }
  const wrap = h("div", { class: "ease-grid" }, fields);
  ui.register(() => {
    wrap.hidden = !show();
  });
  return wrap;
}

/**
 * The shape set is ordered, and click order is the order — clicking circle
 * then square then diamond gives dark=circle, mid=square, bright=diamond.
 */
function shapeSetEditor(ui: Ui, store: Store, on: () => boolean): HTMLElement {
  const chips = h("div", { class: "chips" });
  const seq = h("div", { class: "seq" });

  const current = (): PrimitiveType[] => store.get().shapeSet ?? [];

  for (const p of SHAPE_SET_CHOICES) {
    chips.append(
      h("button", {
        class: "chip",
        attr: { type: "button", "data-shape": p },
        text: PRIMITIVE_LABELS[p],
        on: {
          click: () => {
            const set = current();
            store.set({
              shapeSet: set.includes(p)
                ? set.filter((x) => x !== p)
                : [...set, p],
            });
          },
        },
      }),
    );
  }

  const wrap = h("div", { class: "shape-set" }, [
    h("div", { class: "row-label", text: "Shape set (click order = order)" }),
    chips,
    seq,
  ]);

  ui.register(() => {
    wrap.hidden = !on();
    if (wrap.hidden) return;
    const set = current();
    for (const el of Array.from(chips.children)) {
      const p = el.getAttribute("data-shape") as PrimitiveType;
      el.classList.toggle("on", set.includes(p));
    }
    clear(seq);
    if (!set.length) {
      seq.append(h("span", { class: "seq-empty", text: "pick two or more" }));
      return;
    }
    set.forEach((p, i) => {
      if (i > 0) seq.append(h("span", { class: "seq-arrow", text: "→" }));
      seq.append(h("span", { class: "seq-item", text: PRIMITIVE_LABELS[p] }));
    });
  });

  return wrap;
}
