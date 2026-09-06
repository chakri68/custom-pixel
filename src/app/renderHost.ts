import type { RenderConfig, RenderStats } from "../types.ts";
import { createEngine } from "../worker/engine.ts";
import type {
  CustomSvgPayload,
  MainToWorker,
  WorkerToMain,
} from "../worker/protocol.ts";

/**
 * Owns the renderer (a Worker when available), the preview canvas, and the
 * scheduling that keeps the UI responsive:
 *
 *  - one render in flight at a time, newer requests replace the queued one
 *  - while a control is being dragged, render a downgraded draft
 *  - results carrying a stale id are dropped
 */

const DRAFT_MAX_COLUMNS = 60;
const MAX_LAYOUT_WIDTH = 2000;
const BUSY_AFTER_MS = 100;

export interface HostCallbacks {
  onStats: (stats: RenderStats, truncated: boolean) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  onPalette: (palette: string[] | null) => void;
}

export interface RenderHost {
  setImage: (bitmap: ImageBitmap, aspect: number) => void;
  setCustomSvg: (svg: CustomSvgPayload | undefined) => void;
  setInteracting: (on: boolean) => void;
  request: (config: RenderConfig) => void;
  resize: (config: RenderConfig) => void;
  exportRaster: (
    config: RenderConfig,
    scale: number,
    format: "png" | "jpeg",
  ) => Promise<Blob>;
  exportSvg: (config: RenderConfig, scale: number) => Promise<string>;
  layout: () => { w: number; h: number };
  usingWorker: boolean;
}

export function createRenderHost(
  canvas: HTMLCanvasElement,
  frame: HTMLElement,
  cbs: HostCallbacks,
): RenderHost {
  const bitmapCtx = canvas.getContext("bitmaprenderer");

  let nextId = 1;
  let inFlight = 0;
  let queued: RenderConfig | null = null;
  let scheduled = false;
  let interacting = false;
  let busyTimer: number | undefined;
  let customSvg: CustomSvgPayload | undefined;

  let sourceAspect = 1;
  let layoutW = 800;
  let layoutH = 600;

  const pending = new Map<
    number,
    { resolve: (v: never) => void; reject: (e: Error) => void }
  >();

  /* ------------------------------------------------------------- transport */

  let send: (msg: MainToWorker, transfer?: Transferable[]) => void;
  let usingWorker = true;

  const onMessage = (msg: WorkerToMain): void => {
    switch (msg.type) {
      case "ready":
        return;
      case "rendered": {
        // A newer request already went out — this frame is history.
        if (msg.id < inFlight) {
          msg.bitmap.close();
          return;
        }
        if (bitmapCtx) bitmapCtx.transferFromImageBitmap(msg.bitmap);
        cbs.onStats(msg.stats, msg.truncated);
        cbs.onPalette(msg.palette);
        settleRender();
        return;
      }
      case "blob":
      case "svg": {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.resolve((msg.type === "blob" ? msg.blob : msg.text) as never);
        return;
      }
      case "error": {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p.reject(new Error(msg.message));
        } else {
          settleRender();
        }
        cbs.onError(msg.message);
        return;
      }
    }
  };

  try {
    const worker = new Worker(
      new URL("../worker/render.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (ev: MessageEvent<WorkerToMain>) => onMessage(ev.data);
    worker.onerror = (ev) => cbs.onError(ev.message || "Worker failed");
    send = (msg, transfer) => worker.postMessage(msg, transfer ?? []);
  } catch {
    // No module workers: run the identical engine inline. Slower under the
    // finger, but it renders.
    usingWorker = false;
    const handle = createEngine((msg) => onMessage(msg));
    send = (msg) => void handle(msg);
  }

  /* -------------------------------------------------------------- schedule */

  function settleRender(): void {
    inFlight = 0;
    window.clearTimeout(busyTimer);
    cbs.onBusy(false);
    if (queued) schedule();
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    // One frame of coalescing: a slider firing input events faster than the
    // display refreshes gains nothing from the extra renders.
    requestAnimationFrame(() => {
      scheduled = false;
      if (inFlight || !queued) return;
      const config = queued;
      queued = null;
      dispatch(config);
    });
  }

  function dispatch(config: RenderConfig): void {
    const job = interacting ? draft(config) : config;
    inFlight = nextId++;
    window.clearTimeout(busyTimer);
    busyTimer = window.setTimeout(() => cbs.onBusy(true), BUSY_AFTER_MS);
    send({
      type: "render",
      id: inFlight,
      config: job,
      layoutW,
      layoutH,
      customSvg,
    });
  }

  /** Drag-time downgrade: fewer cells, and never the slow sampler. */
  function draft(config: RenderConfig): RenderConfig {
    if (
      config.columns <= DRAFT_MAX_COLUMNS &&
      config.samplingMode !== "median"
    ) {
      return config;
    }
    return {
      ...config,
      columns: Math.min(config.columns, DRAFT_MAX_COLUMNS),
      samplingMode:
        config.samplingMode === "median" ? "average" : config.samplingMode,
    };
  }

  /* ---------------------------------------------------------------- layout */

  function applyLayout(config: RenderConfig): void {
    const aspect = config.aspect ?? sourceAspect;
    const boxW = Math.max(80, frame.clientWidth);
    const boxH = Math.max(80, frame.clientHeight);
    const cssW = Math.min(boxW, boxH * aspect);
    const cssH = cssW / aspect;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    layoutW = Math.max(64, Math.min(MAX_LAYOUT_WIDTH, Math.round(cssW * dpr)));
    layoutH = Math.max(64, Math.round(layoutW / aspect));

    canvas.style.width = `${Math.round(cssW)}px`;
    canvas.style.height = `${Math.round(cssH)}px`;
    if (canvas.width !== layoutW || canvas.height !== layoutH) {
      canvas.width = layoutW;
      canvas.height = layoutH;
    }
  }

  function ask<T>(msg: MainToWorker): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.set(msg.type === "image" ? 0 : msg.id, {
        resolve: resolve as (v: never) => void,
        reject,
      });
      send(msg);
    });
  }

  return {
    usingWorker,
    layout: () => ({ w: layoutW, h: layoutH }),

    setImage(bitmap, aspect) {
      sourceAspect = aspect;
      send({ type: "image", bitmap }, usingWorker ? [bitmap] : []);
    },

    setCustomSvg(svg) {
      customSvg = svg;
    },

    setInteracting(on) {
      interacting = on;
    },

    request(config) {
      applyLayout(config);
      queued = config;
      schedule();
    },

    resize(config) {
      applyLayout(config);
      queued = config;
      schedule();
    },

    exportRaster(config, scale, format) {
      applyLayout(config);
      return ask<Blob>({
        type: "exportRaster",
        id: nextId++,
        config,
        layoutW,
        layoutH,
        customSvg,
        scale,
        format,
        quality: format === "jpeg" ? 0.92 : 1,
      });
    },

    exportSvg(config, scale) {
      applyLayout(config);
      return ask<string>({
        type: "exportSvg",
        id: nextId++,
        config,
        layoutW,
        layoutH,
        customSvg,
        scale,
      });
    },
  };
}
