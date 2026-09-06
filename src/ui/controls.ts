import { h } from "./dom.ts";

/**
 * Control factories. Every control is a closure over a get/set pair on the
 * store plus a `sync()` that pulls the DOM back in line — that is what makes
 * loading a preset or a shared URL update all 60-odd inputs for free.
 */

export interface Ui {
  register: (sync: () => void) => void;
  /** Marks the start/end of a drag so the host can render a cheap draft. */
  setInteracting: (on: boolean) => void;
}

/** Skip syncing the field the user is currently typing into. */
function editing(el: Element): boolean {
  return document.activeElement === el;
}

let uid = 0;

/**
 * Wires the row's label to whatever focusable thing the control wraps. Real
 * form fields get `for`/`id`; the chip toggles are buttons, which `for` does
 * not address, so they get `aria-labelledby` instead.
 */
function linkLabel(label: HTMLLabelElement, control: HTMLElement): void {
  const target =
    control.matches("input, select, textarea, button")
      ? control
      : control.querySelector<HTMLElement>("input, select, textarea, button");
  if (!target) return;
  const n = ++uid;
  target.id = target.id || `ctl-${n}`;
  if (target instanceof HTMLButtonElement) {
    label.id = `lbl-${n}`;
    target.setAttribute("aria-labelledby", label.id);
  } else {
    label.htmlFor = target.id;
  }
}

export interface RowOpts {
  label: string;
  hint?: string;
  showIf?: () => boolean;
}

function row(
  opts: RowOpts,
  control: HTMLElement,
  ui: Ui,
  syncControl: () => void,
): HTMLElement {
  const label = h("label", {
    class: "row-label",
    text: opts.label,
    title: opts.hint,
  });
  linkLabel(label, control);
  const el = h("div", { class: "row" }, [label, control]);
  ui.register(() => {
    if (opts.showIf) el.hidden = !opts.showIf();
    if (!el.hidden) syncControl();
  });
  return el;
}

/* ---------------------------------------------------------------- slider */

export interface SliderOpts extends RowOpts {
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  format?: (v: number) => string;
}

export function slider(ui: Ui, o: SliderOpts): HTMLElement {
  const fmt = o.format ?? ((v: number) => String(round(v, 3)));
  const out = h("span", { class: "num" });
  const input = h("input", {
    class: "range",
    attr: { type: "range", min: o.min, max: o.max, step: o.step },
    on: {
      input: () => {
        o.set(Number((input as HTMLInputElement).value));
      },
      pointerdown: () => ui.setInteracting(true),
      pointerup: () => ui.setInteracting(false),
      pointercancel: () => ui.setInteracting(false),
    },
  }) as HTMLInputElement;

  const control = h("div", { class: "slider" }, [input, out]);
  return row(o, control, ui, () => {
    const v = o.get();
    if (!editing(input)) input.value = String(v);
    out.textContent = fmt(v);
  });
}

/* ---------------------------------------------------------------- select */

export interface SelectOpts<T extends string> extends RowOpts {
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  get: () => T;
  set: (v: T) => void;
}

export function select<T extends string>(
  ui: Ui,
  o: SelectOpts<T>,
): HTMLElement {
  const el = h("select", {
    on: { change: () => o.set((el as HTMLSelectElement).value as T) },
  }) as HTMLSelectElement;
  for (const opt of o.options) {
    el.append(
      h("option", {
        text: opt.label,
        attr: { value: opt.value, disabled: opt.disabled },
      }),
    );
  }
  return row(o, el, ui, () => {
    const v = o.get();
    if (el.value !== v) el.value = v;
  });
}

/* ---------------------------------------------------------------- toggle */

export interface ToggleOpts extends RowOpts {
  get: () => boolean;
  set: (v: boolean) => void;
}

export function toggle(ui: Ui, o: ToggleOpts): HTMLElement {
  const el = h("button", {
    class: "chip toggle",
    attr: { type: "button", role: "switch" },
    on: { click: () => o.set(!o.get()) },
  });
  return row(o, el, ui, () => {
    const on = o.get();
    el.classList.toggle("on", on);
    el.textContent = on ? "ON" : "OFF";
    el.setAttribute("aria-checked", String(on));
  });
}

/* ----------------------------------------------------------------- number */

export interface NumberOpts extends RowOpts {
  min?: number;
  max?: number;
  step?: number;
  get: () => number;
  set: (v: number) => void;
}

export function numberInput(ui: Ui, o: NumberOpts): HTMLElement {
  const el = h("input", {
    attr: { type: "number", min: o.min, max: o.max, step: o.step ?? "any" },
    on: {
      input: () => {
        const v = Number((el as HTMLInputElement).value);
        if (Number.isFinite(v)) o.set(v);
      },
    },
  }) as HTMLInputElement;
  return row(o, el, ui, () => {
    if (!editing(el)) el.value = String(round(o.get(), 4));
  });
}

/* ------------------------------------------------------------------ color */

export interface ColorOpts extends RowOpts {
  get: () => string;
  set: (v: string) => void;
  /** Adds a "source" choice that reuses the cell's own colour. */
  allowSource?: boolean;
}

export function colorInput(ui: Ui, o: ColorOpts): HTMLElement {
  const swatch = h("input", {
    class: "color",
    attr: { type: "color" },
    on: { input: () => o.set((swatch as HTMLInputElement).value) },
  }) as HTMLInputElement;

  const srcBtn = o.allowSource
    ? h("button", {
        class: "chip",
        attr: { type: "button" },
        text: "SRC",
        title: "Use each cell's sampled colour",
        on: {
          click: () => o.set(o.get() === "source" ? swatch.value : "source"),
        },
      })
    : null;

  const control = h("div", { class: "color-row" }, [swatch, srcBtn]);
  return row(o, control, ui, () => {
    const v = o.get();
    const isSource = v === "source";
    if (srcBtn) srcBtn.classList.toggle("on", isSource);
    swatch.disabled = isSource;
    if (!isSource && /^#[0-9a-fA-F]{6}$/.test(v)) swatch.value = v;
  });
}

/* -------------------------------------------------------------- text input */

export interface TextOpts extends RowOpts {
  placeholder?: string;
  get: () => string;
  set: (v: string) => void;
}

export function textInput(ui: Ui, o: TextOpts): HTMLElement {
  const el = h("input", {
    attr: { type: "text", spellcheck: "false", placeholder: o.placeholder },
    on: { input: () => o.set((el as HTMLInputElement).value) },
  }) as HTMLInputElement;
  return row(o, el, ui, () => {
    if (!editing(el)) el.value = o.get();
  });
}

/* ------------------------------------------------------------------ misc */

export function button(
  label: string,
  onClick: () => void,
  cls = "btn",
): HTMLButtonElement {
  return h("button", {
    class: cls,
    attr: { type: "button" },
    text: label,
    on: { click: onClick },
  }) as HTMLButtonElement;
}

export function section(title: string, children: HTMLElement[]): HTMLElement {
  const body = h("div", { class: "panel-body" }, children);
  const head = h("h2", {
    class: "panel-head",
    text: title,
    attr: { tabindex: "0", role: "button" },
  });
  const panel = h("section", { class: "panel" }, [head, body]);
  const toggleOpen = (): void => {
    panel.classList.toggle("collapsed");
  };
  head.addEventListener("click", toggleOpen);
  head.addEventListener("keydown", (ev) => {
    const key = (ev as KeyboardEvent).key;
    if (key === "Enter" || key === " ") {
      ev.preventDefault();
      toggleOpen();
    }
  });
  return panel;
}

export function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}
