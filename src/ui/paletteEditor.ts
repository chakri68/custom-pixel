import type { Store } from "../app/store.ts";
import { parseHex } from "../core/color.ts";
import { button, type Ui } from "./controls.ts";
import { clear, h } from "./dom.ts";

/**
 * User palette editing. Also the landing spot for the auto palette: median-cut
 * hands back real hex strings, so "lift it into the editor and tweak" is a
 * one-click move rather than a retype.
 */

export function paletteEditor(
  ui: Ui,
  store: Store,
  derived: () => string[] | null,
): HTMLElement {
  const swatches = h("div", { class: "swatches" });

  const colors = (): string[] => {
    const c = store.get().color;
    return c.kind === "palette" ? c.colors : [];
  };

  const setColors = (next: string[]): void => {
    const c = store.get().color;
    store.set({
      color: {
        kind: "palette",
        colors: next.length ? next : ["#000000"],
        dither: c.kind === "palette" ? c.dither : false,
      },
    });
  };

  const addBtn = button(
    "+ add colour",
    () => setColors([...colors(), "#ffb000"]),
    "add-rule",
  );

  const paste = h("input", {
    attr: {
      type: "text",
      placeholder: "#0b0b0a, #ffb000, #ece7da",
      spellcheck: "false",
      "aria-label": "Paste a hex colour list",
    },
    on: {
      change: (ev) => {
        const el = ev.target as HTMLInputElement;
        const found = el.value
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter((s) => parseHex(s) !== null)
          .map((s) => (s.startsWith("#") ? s : `#${s}`));
        if (found.length) {
          setColors(found);
          el.value = "";
        }
      },
    },
  });

  const lift = button("Use auto palette", () => {
    const d = derived();
    if (d?.length) setColors(d);
  });

  const wrap = h("div", { class: "palette" }, [
    h("div", { class: "row-label", text: "Palette" }),
    swatches,
    addBtn,
    h("div", { class: "row-label", text: "Paste hex list" }),
    paste,
    lift,
  ]);

  ui.register(() => {
    const mode = store.get().color;
    wrap.hidden = mode.kind !== "palette";
    lift.hidden = !derived()?.length;
    if (wrap.hidden) return;

    const list = colors();
    clear(swatches);
    list.forEach((c, i) => {
      const input = h("input", {
        class: "color",
        attr: {
          type: "color",
          value: /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000",
          "aria-label": `Palette colour ${i + 1}`,
        },
        on: {
          input: () => {
            const next = colors().slice();
            next[i] = (input as HTMLInputElement).value;
            setColors(next);
          },
        },
      });
      const del = h("button", {
        class: "icon-btn danger",
        attr: { type: "button", "aria-label": `Remove colour ${i + 1}` },
        text: "×",
        on: { click: () => setColors(colors().filter((_, j) => j !== i)) },
      });
      swatches.append(h("div", { class: "swatch" }, [input, del]));
    });
  });

  return wrap;
}

/** Read-only strip showing the palette the renderer actually used. */
export function derivedPaletteStrip(
  ui: Ui,
  store: Store,
  derived: () => string[] | null,
): HTMLElement {
  const strip = h("div", { class: "strip" });
  const wrap = h("div", { class: "derived" }, [
    h("div", { class: "row-label", text: "Auto palette" }),
    strip,
  ]);
  ui.register(() => {
    const list = derived();
    wrap.hidden = store.get().color.kind !== "quantize" || !list?.length;
    if (wrap.hidden || !list) return;
    clear(strip);
    for (const c of list) {
      strip.append(
        h("span", { class: "strip-cell", title: c, style: { background: c } }),
      );
    }
  });
  return wrap;
}
