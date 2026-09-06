import "./style.css";

import { normalizeSvgPath } from "./app/customSvg.ts";
import { DEMO_IMAGES, renderDemo } from "./app/demo.ts";
import { downloadBlob, loadImageFile, pickImageFile } from "./app/imageLoad.ts";
import { createRenderHost } from "./app/renderHost.ts";
import { createStore } from "./app/store.ts";
import { DEFAULT_CONFIG } from "./config/defaults.ts";
import { PRESETS } from "./config/presets.ts";
import { configFromHash, encodeConfig, sanitizeConfig, shareUrl } from "./config/urlState.ts";
import type { RenderStats } from "./types.ts";
import { button, slider, type Ui } from "./ui/controls.ts";
import { h } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { buildLeftSidebar } from "./ui/sidebarLeft.ts";
import { buildRightSidebar } from "./ui/sidebarRight.ts";

const shell = buildShell();
document.querySelector<HTMLDivElement>("#app")!.append(shell.root);

const store = createStore(configFromHash(location.hash) ?? structuredClone(DEFAULT_CONFIG));

/* ------------------------------------------------------------ ui plumbing */

const syncs: Array<() => void> = [];
const ui: Ui = {
  register: (fn) => syncs.push(fn),
  setInteracting: (on) => {
    host.setInteracting(on);
    // On release, redo the frame at full settings — the draft was capped.
    if (!on) host.request(store.get());
  },
};
const syncAll = (): void => {
  for (const fn of syncs) fn();
};

let derivedPalette: string[] | null = null;
let imageName = "demo";

const host = createRenderHost(shell.canvas, shell.stage, {
  onStats: (stats, truncated) => {
    showStats(stats);
    if (truncated) {
      shell.toast("Cell budget hit — lower the column count", "warn");
    }
  },
  onBusy: (busy) => shell.busy.classList.toggle("show", busy),
  onError: (message) => shell.toast(message, "error"),
  onPalette: (palette) => {
    const changed = JSON.stringify(palette) !== JSON.stringify(derivedPalette);
    derivedPalette = palette;
    // The palette comes back *from* a render, so only re-sync when it moved,
    // otherwise every frame would rebuild the swatch strip.
    if (changed) syncAll();
  },
});

function showStats(stats: RenderStats): void {
  const { w, h: hh } = host.layout();
  shell.statCells.textContent = stats.cells.toLocaleString();
  shell.statMs.textContent = stats.ms.toFixed(1);
  shell.statSize.textContent = `${w}×${hh}`;
  shell.statMode.textContent = host.usingWorker ? "worker" : "inline";
}

/* ---------------------------------------------------------------- panels */

const left = buildLeftSidebar(ui, store, {
  upload: () => void chooseFile(),
  useDemo: (id) => void useDemo(id),
  applyPreset: (id) => {
    const p = PRESETS.find((x) => x.id === id);
    if (p) {
      store.replace(structuredClone(p.config));
      shell.toast(`Preset: ${p.name}`);
    }
  },
  applyCustomSvg: (text) => applyCustomSvg(text),
});
shell.leftSlot.append(left.el);

shell.rightSlot.append(
  buildRightSidebar(ui, store, () => derivedPalette, {
    raster: (scale, format) => void exportRaster(scale, format),
    svg: (scale) => void exportSvg(scale),
    savePreset,
    loadPreset: () => void loadPreset(),
    copyShare: () => void copyShare(),
  }),
);

shell.bottomSlot.append(
  slider(ui, {
    label: "Columns",
    min: 4,
    max: 300,
    step: 1,
    format: (v) => String(Math.round(v)),
    get: () => store.get().columns,
    set: (v) => store.set({ columns: Math.round(v) }),
  }),
  slider(ui, {
    label: "Gap",
    min: -0.4,
    max: 0.9,
    step: 0.01,
    get: () => store.get().gap,
    set: (v) => store.set({ gap: v }),
  }),
);

shell.topActions.append(
  button("?", showAbout, "btn btn-icon"),
  button("Reset", () => {
    store.replace(structuredClone(DEFAULT_CONFIG));
    shell.toast("Reset to defaults");
  }),
  button("Share", () => void copyShare()),
  button("Export PNG", () => void exportRaster(2, "png"), "btn primary"),
);

/* -------------------------------------------------------------- reactions */

let hashTimer: number | undefined;

store.subscribe((config) => {
  syncAll();
  host.request(config);
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    history.replaceState(null, "", `#c=${encodeConfig(config)}`);
  }, 400);
});

new ResizeObserver(() => host.resize(store.get())).observe(shell.stage);

/* ----------------------------------------------------------------- source */

async function setImage(bitmap: ImageBitmap, name: string): Promise<void> {
  imageName = name;
  host.setImage(bitmap, bitmap.width / bitmap.height);
  host.request(store.get());
}

async function chooseFile(): Promise<void> {
  const file = await pickImageFile();
  if (file) await loadFile(file);
}

async function loadFile(file: File): Promise<void> {
  try {
    const { bitmap, name } = await loadImageFile(file);
    await setImage(bitmap, name);
    shell.toast(`Loaded ${file.name}`);
  } catch (err) {
    shell.toast(err instanceof Error ? err.message : "Could not read image", "error");
  }
}

async function useDemo(id: string): Promise<void> {
  const demo = DEMO_IMAGES.find((d) => d.id === id) ?? DEMO_IMAGES[0];
  await setImage(await renderDemo(demo), demo.id);
}

function applyCustomSvg(text: string): void {
  if (!text.trim()) {
    host.setCustomSvg(undefined);
    store.set({ customSvgPath: undefined });
    left.svgStatus.className = "notice";
    return;
  }
  const payload = normalizeSvgPath(text);
  if (!payload) {
    left.svgStatus.className = "notice show error";
    left.svgStatus.textContent = "Could not read a path out of that.";
    return;
  }
  host.setCustomSvg(payload);
  left.svgStatus.className = "notice show";
  left.svgStatus.textContent = `Path accepted — ${payload.d.length} chars.`;
  store.set({ customSvgPath: payload.d, primitive: "custom-svg" });
}

/* ------------------------------------------------------- drag and drop */

for (const type of ["dragenter", "dragover"]) {
  document.addEventListener(type, (ev) => {
    ev.preventDefault();
    left.dropzone.classList.add("over");
    shell.frame.classList.add("over");
  });
}
for (const type of ["dragleave", "drop"]) {
  document.addEventListener(type, (ev) => {
    ev.preventDefault();
    left.dropzone.classList.remove("over");
    shell.frame.classList.remove("over");
  });
}
document.addEventListener("drop", (ev) => {
  const file = (ev as DragEvent).dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

/* ---------------------------------------------------------------- export */

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function exportRaster(scale: number, format: "png" | "jpeg"): Promise<void> {
  try {
    shell.toast(`Rendering ${scale}× ${format.toUpperCase()}…`);
    const blob = await host.exportRaster(store.get(), scale, format);
    downloadBlob(
      blob,
      `${imageName}-${store.get().primitive}-${stamp()}.${format === "jpeg" ? "jpg" : "png"}`,
    );
    shell.toast(`Saved ${(blob.size / 1024).toFixed(0)} kB`);
  } catch (err) {
    shell.toast(err instanceof Error ? err.message : "Export failed", "error");
  }
}

async function exportSvg(scale: number): Promise<void> {
  try {
    shell.toast("Serialising SVG…");
    const text = await host.exportSvg(store.get(), scale);
    downloadBlob(
      new Blob([text], { type: "image/svg+xml" }),
      `${imageName}-${store.get().primitive}-${stamp()}.svg`,
    );
    shell.toast(`Saved ${(text.length / 1024).toFixed(0)} kB of SVG`);
  } catch (err) {
    shell.toast(err instanceof Error ? err.message : "Export failed", "error");
  }
}

function savePreset(): void {
  downloadBlob(
    new Blob([JSON.stringify(store.get(), null, 2)], { type: "application/json" }),
    `shape-pixel-preset-${stamp()}.json`,
  );
}

async function loadPreset(): Promise<void> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      store.replace(sanitizeConfig(JSON.parse(await file.text())));
      shell.toast("Preset loaded");
    } catch {
      shell.toast("That is not a valid preset file", "error");
    }
  };
  input.click();
}

async function copyShare(): Promise<void> {
  const url = shareUrl(store.get());
  try {
    await navigator.clipboard.writeText(url);
    shell.toast("Share URL copied — the recipient brings their own image");
  } catch {
    const field = h("input", {
      attr: { type: "text", value: url, "aria-label": "Share URL" },
    });
    shell.openModal("Share URL", field);
    (field as HTMLInputElement).select();
  }
}

function showAbout(): void {
  shell.openModal(
    "Shape Pixel",
    h("div", {}, [
      h("p", {
        text: "Rebuilds an image out of shapes instead of squares. Every primitive is a unit Path2D, which is why SVG export is the same geometry rather than a trace of the bitmap.",
      }),
      h("p", {
        text: "Sampling runs in linear light and the grid is specified in columns, not pixels — so exporting at 4× scales the composition instead of re-laying it out.",
      }),
      h("p", {
        text: "The URL hash carries the full config minus the image. Send someone a link and they get your settings on their own picture.",
      }),
    ]),
  );
}

/* ------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  syncAll();
  await useDemo("portrait");

  const intro = document.getElementById("intro");
  if (!intro) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    intro.remove();
    document.body.classList.add("booted");
    return;
  }
  // Wait for the pixel font: it must never flash a fallback, because the
  // metrics are wildly different and the title would jump. Racing a timeout
  // matters — the overlay covers the whole app, so a blocked or slow font CDN
  // would otherwise leave a black screen with no way out.
  try {
    await Promise.race([
      document.fonts.load('12px "Press Start 2P"'),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* fall through — the sequence still runs, just with a fallback face */
  }
  intro.classList.remove("booting");
  intro.classList.add("booted");
  document.body.classList.add("booted");
  setTimeout(() => intro.remove(), 2400);
}

void boot();
