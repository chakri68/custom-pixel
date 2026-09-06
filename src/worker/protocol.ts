import type { Normalization } from "../core/primitives.ts";
import type { ViewTransform } from "../core/renderRaster.ts";
import type { RenderConfig, RenderStats } from "../types.ts";

/**
 * Custom SVG paths are normalised on the main thread with `getBBox()` — the
 * worker has no DOM, and reimplementing a path bbox parser to avoid one call
 * would be a poor trade.
 */
export interface CustomSvgPayload {
  d: string;
  norm: Normalization;
}

export interface RenderJob {
  id: number;
  config: RenderConfig;
  layoutW: number;
  layoutH: number;
  customSvg?: CustomSvgPayload;
  /** Preview only. Exports always cover the whole composition. */
  view?: ViewTransform;
  /** Draw the fitted source instead of the cells, for A/B comparison. */
  peek?: boolean;
}

export type MainToWorker =
  | { type: "image"; bitmap: ImageBitmap }
  | ({ type: "render" } & RenderJob)
  | ({
      type: "exportRaster";
      scale: number;
      format: "png" | "jpeg";
      quality: number;
    } & RenderJob)
  | ({ type: "exportSvg"; scale: number } & RenderJob);

export type WorkerToMain =
  | { type: "ready" }
  | {
      type: "rendered";
      id: number;
      bitmap: ImageBitmap;
      stats: RenderStats;
      palette: string[] | null;
      truncated: boolean;
    }
  | { type: "blob"; id: number; blob: Blob; format: "png" | "jpeg" }
  | { type: "svg"; id: number; text: string }
  | { type: "error"; id: number; message: string };
