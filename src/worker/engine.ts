import { runPipeline, type PipelineResult } from "../core/pipeline.ts";
import { drawResult } from "../core/renderRaster.ts";
import { renderSvg } from "../core/renderSvg.ts";
import { adjustSource, buildSource, type LinearSource } from "../core/source.ts";
import type { RenderConfig } from "../types.ts";
import type { MainToWorker, RenderJob, WorkerToMain } from "./protocol.ts";

/**
 * The renderer, independent of where it runs. The worker is a five-line
 * adapter over this; if `Worker` is unavailable the same instance runs inline
 * on the main thread with identical behaviour.
 *
 * Three caches, invalidated in a chain: the fitted linear source depends only
 * on the image, the fit and the aspect; the adjusted buffer adds
 * contrast/brightness; the pipeline result adds everything else. Dragging a
 * size-mapping slider only busts the last one.
 */

export type PostFn = (msg: WorkerToMain, transfer?: Transferable[]) => void;

export function createEngine(post: PostFn) {
  let bitmap: ImageBitmap | null = null;

  let sourceKey = "";
  let source: LinearSource | null = null;
  let adjustedKey = "";
  let adjusted: LinearSource | null = null;
  let resultKey = "";
  let result: PipelineResult | null = null;
  let scratch: OffscreenCanvas | null = null;

  function getSource(job: RenderJob): LinearSource {
    if (!bitmap) throw new Error("No image loaded");
    const aspect = job.layoutW / job.layoutH;
    const key = `${aspect.toFixed(5)}|${job.config.fit}|${bitmap.width}x${bitmap.height}`;
    if (key !== sourceKey || !source) {
      source = buildSource(bitmap, aspect, job.config.fit);
      sourceKey = key;
      adjustedKey = "";
    }
    const aKey = `${key}|${job.config.contrast}|${job.config.brightness}`;
    if (aKey !== adjustedKey || !adjusted) {
      adjusted = adjustSource(source, job.config.contrast, job.config.brightness);
      adjustedKey = aKey;
    }
    return adjusted;
  }

  /** Everything the cell/style pass depends on, minus what only affects drawing. */
  function pipelineKey(job: RenderJob): string {
    const c: Partial<RenderConfig> = { ...job.config };
    delete c.background;
    delete c.transparentBackground;
    return JSON.stringify([
      c,
      Math.round(job.layoutW),
      Math.round(job.layoutH),
      job.customSvg?.d,
      job.customSvg?.norm,
    ]);
  }

  function getResult(job: RenderJob): PipelineResult {
    const key = pipelineKey(job);
    if (key !== resultKey || !result) {
      result = runPipeline({
        config: job.config,
        source: getSource(job),
        layoutW: job.layoutW,
        layoutH: job.layoutH,
        customSvg: job.customSvg,
      });
      resultKey = key;
    }
    return result;
  }

  function canvasFor(w: number, h: number): OffscreenCanvas {
    if (!scratch) scratch = new OffscreenCanvas(w, h);
    else if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    return scratch;
  }

  return async function handle(msg: MainToWorker): Promise<void> {
    try {
      switch (msg.type) {
        case "image": {
          bitmap?.close();
          bitmap = msg.bitmap;
          sourceKey = adjustedKey = resultKey = "";
          source = adjusted = result = null;
          return;
        }

        case "render": {
          const t0 = performance.now();
          const res = getResult(msg);
          const W = Math.max(1, Math.round(msg.layoutW));
          const H = Math.max(1, Math.round(msg.layoutH));
          const ctx = canvasFor(W, H).getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          drawResult(ctx, res, msg.config, msg.layoutW, msg.layoutH, 1);
          const out = ctx.canvas.transferToImageBitmap();
          post(
            {
              type: "rendered",
              id: msg.id,
              bitmap: out,
              stats: {
                cells: res.cells.length,
                ms: performance.now() - t0,
                columns: msg.config.columns,
              },
              palette: res.palette,
              truncated: res.truncated,
            },
            [out],
          );
          return;
        }

        case "exportRaster": {
          const res = getResult(msg);
          const W = Math.max(1, Math.round(msg.layoutW * msg.scale));
          const H = Math.max(1, Math.round(msg.layoutH * msg.scale));
          // Its own canvas, so the preview's scratch survives a big export.
          const ctx = new OffscreenCanvas(W, H).getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          // JPEG has no alpha channel; a transparent background would bake
          // out black, so force the colour back on.
          const config =
            msg.format === "jpeg"
              ? { ...msg.config, transparentBackground: false }
              : msg.config;
          drawResult(ctx, res, config, msg.layoutW, msg.layoutH, msg.scale);
          const blob = await ctx.canvas.convertToBlob({
            type: msg.format === "jpeg" ? "image/jpeg" : "image/png",
            quality: msg.quality,
          });
          post({ type: "blob", id: msg.id, blob, format: msg.format });
          return;
        }

        case "exportSvg": {
          const res = getResult(msg);
          post({
            type: "svg",
            id: msg.id,
            text: renderSvg(res, msg.config, msg.layoutW, msg.layoutH, msg.scale),
          });
          return;
        }
      }
    } catch (err) {
      post({
        type: "error",
        id: "id" in msg ? msg.id : 0,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
