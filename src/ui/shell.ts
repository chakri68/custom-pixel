import { h } from "./dom.ts";

/**
 * App skeleton: top bar, left panel, canvas well, resizer, right panel,
 * bottom control bar. Everything returns refs; wiring lives in main.
 */

export interface Shell {
  root: HTMLElement;
  topActions: HTMLElement;
  leftSlot: HTMLElement;
  rightSlot: HTMLElement;
  bottomSlot: HTMLElement;
  stage: HTMLElement;
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  busy: HTMLElement;
  statCells: HTMLElement;
  statMs: HTMLElement;
  statSize: HTMLElement;
  statMode: HTMLElement;
  toast: (message: string, kind?: "info" | "warn" | "error") => void;
  openModal: (title: string, body: Node) => void;
}

export function buildShell(): Shell {
  const canvas = h("canvas", {
    class: "preview",
    attr: { id: "preview", "aria-label": "Rendered output" },
  }) as HTMLCanvasElement;

  const busy = h("div", { class: "busy", text: "RENDERING" });
  const frame = h("div", { class: "frame" }, [canvas, busy]);
  const stage = h("div", { class: "stage" }, [frame]);

  const topActions = h("div", { class: "top-actions" });
  const top = h("header", { class: "topbar" }, [
    h("h1", { text: "SHAPE PIXEL" }),
    h("span", { class: "tagline", text: "pixels, but not square" }),
    h("div", { class: "spacer" }),
    topActions,
  ]);

  const leftSlot = h("div", { class: "slot slot-left" });
  const rightSlot = h("div", { class: "slot slot-right" });

  const resizer = h("div", {
    class: "resizer",
    attr: { role: "separator", "aria-label": "Resize panel", tabindex: "0" },
  });

  const statCells = h("span", { class: "stat-val" });
  const statMs = h("span", { class: "stat-val" });
  const statSize = h("span", { class: "stat-val" });
  const statMode = h("span", { class: "stat-val" });
  const bottomSlot = h("div", { class: "bottom-controls" });

  const bottom = h("footer", { class: "bottombar" }, [
    bottomSlot,
    h("div", { class: "stats" }, [
      stat("cells", statCells),
      stat("ms", statMs),
      stat("out", statSize),
      stat("engine", statMode),
    ]),
  ]);

  const main = h("div", { class: "main" }, [
    leftSlot,
    stage,
    resizer,
    rightSlot,
  ]);
  const root = h("div", { class: "shell" }, [top, main, bottom]);

  wireResizer(resizer, root);

  /* --------------------------------------------------------------- toast */

  const toastEl = h("div", { class: "toast" });
  root.append(toastEl);
  let toastTimer: number | undefined;
  const toast = (
    message: string,
    kind: "info" | "warn" | "error" = "info",
  ): void => {
    toastEl.textContent = message;
    toastEl.className = `toast show ${kind}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.className = "toast";
    }, 3200);
  };

  /* --------------------------------------------------------------- modal */

  const modalBody = h("div", { class: "modal-body" });
  const modalTitle = h("h3");
  const modalPanel = h("div", { class: "modal-panel" }, [
    modalTitle,
    modalBody,
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn primary",
        attr: { type: "button" },
        text: "Close",
        on: { click: () => closeModal() },
      }),
    ]),
  ]);
  const modal = h(
    "div",
    {
      class: "modal",
      on: {
        click: (ev) => {
          if (ev.target === modal) closeModal();
        },
      },
    },
    [modalPanel],
  );
  root.append(modal);

  function closeModal(): void {
    modal.classList.remove("show");
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });

  const openModal = (title: string, body: Node): void => {
    modalTitle.textContent = title;
    modalBody.replaceChildren(body);
    modal.classList.add("show");
  };

  return {
    root, topActions, leftSlot, rightSlot, bottomSlot, stage, frame, canvas,
    busy, statCells, statMs, statSize, statMode, toast, openModal,
  };
}

function stat(label: string, value: HTMLElement): HTMLElement {
  return h("span", { class: "stat" }, [
    h("span", { class: "stat-key", text: label }),
    value,
  ]);
}

function wireResizer(resizer: HTMLElement, root: HTMLElement): void {
  const MIN = 300;
  const MAX = 620;
  const apply = (px: number): void => {
    root.style.setProperty(
      "--sidebar-w",
      `${Math.round(Math.min(MAX, Math.max(MIN, px)))}px`,
    );
  };

  resizer.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    resizer.setPointerCapture(ev.pointerId);
    document.body.classList.add("resizing");
    const move = (e: PointerEvent): void => apply(window.innerWidth - e.clientX);
    const up = (): void => {
      document.body.classList.remove("resizing");
      resizer.removeEventListener("pointermove", move);
      resizer.removeEventListener("pointerup", up);
    };
    resizer.addEventListener("pointermove", move);
    resizer.addEventListener("pointerup", up);
  });

  resizer.addEventListener("keydown", (ev) => {
    const cur =
      parseInt(getComputedStyle(root).getPropertyValue("--sidebar-w")) || 380;
    if (ev.key === "ArrowLeft") apply(cur + 24);
    else if (ev.key === "ArrowRight") apply(cur - 24);
  });
}
