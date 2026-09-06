import { makeRng } from "../core/rng.ts";

/**
 * Demo images are drawn, not shipped. Three procedural scenes keep the repo
 * free of binary blobs and licence questions, and let us guarantee the tonal
 * range the size mappings need to look good.
 */

export interface DemoImage {
  id: string;
  name: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  width: number;
  height: number;
}

function grad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function radial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r0: number,
  r1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}

function drawPortrait(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [
    [0, "#3d2c1d"],
    [0.55, "#20160f"],
    [1, "#0a0807"],
  ]);
  ctx.fillRect(0, 0, w, h);

  // Key light behind the subject, so the silhouette separates from the ground.
  ctx.fillStyle = radial(ctx, w * 0.33, h * 0.28, 0, w * 0.78, [
    [0, "rgba(255,196,120,0.40)"],
    [0.5, "rgba(150,90,40,0.13)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const headY = h * 0.32;
  const rx = w * 0.185;
  const ry = h * 0.19;
  const lightX = cx - rx * 0.44;
  const lightY = headY - ry * 0.22;

  // Shoulders first, then neck, then head: back to front.
  ctx.fillStyle = grad(ctx, w * 0.15, h * 0.6, w * 0.9, h, [
    [0, "#6b4d2c"],
    [0.55, "#3a2917"],
    [1, "#120d09"],
  ]);
  ctx.beginPath();
  ctx.ellipse(cx, h * 1.0, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#543b21";
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.44, headY + ry * 0.55);
  ctx.lineTo(cx + rx * 0.44, headY + ry * 0.55);
  ctx.lineTo(cx + rx * 0.66, h * 0.62);
  ctx.lineTo(cx - rx * 0.66, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Shadow the neck under the jaw — without it the head floats.
  ctx.fillStyle = "rgba(20,12,7,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx, headY + ry * 0.86, rx * 0.55, ry * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head: an egg with a chin, not an ellipse. Two beziers down each side and
  // a tight curve across the jaw.
  const headPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx, headY - ry);
    ctx.bezierCurveTo(
      cx + rx * 1.04, headY - ry * 0.94,
      cx + rx * 1.0, headY + ry * 0.26,
      cx + rx * 0.6, headY + ry * 0.72,
    );
    ctx.bezierCurveTo(
      cx + rx * 0.36, headY + ry * 1.04,
      cx - rx * 0.36, headY + ry * 1.04,
      cx - rx * 0.6, headY + ry * 0.72,
    );
    ctx.bezierCurveTo(
      cx - rx * 1.0, headY + ry * 0.26,
      cx - rx * 1.04, headY - ry * 0.94,
      cx, headY - ry,
    );
    ctx.closePath();
  };

  ctx.fillStyle = radial(ctx, lightX, lightY, rx * 0.1, rx * 2.5, [
    [0, "#ffeccb"],
    [0.3, "#e2b57a"],
    [0.62, "#95693c"],
    [1, "#31200f"],
  ]);
  headPath();
  ctx.fill();

  // Hair mass, clipped to the skull so it cannot spill onto the face.
  ctx.save();
  headPath();
  ctx.clip();
  ctx.fillStyle = grad(ctx, cx - rx, headY - ry, cx + rx * 0.8, headY - ry * 0.1, [
    [0, "#5a3d21"],
    [1, "#100b07"],
  ]);
  // A cap, not a hood: the hairline lands about a third down the skull, so
  // the lit forehead survives.
  ctx.beginPath();
  ctx.ellipse(cx, headY - ry * 0.82, rx * 1.06, ry * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Brow, eye sockets, nose shadow, mouth. Just enough to read as a face at
  // 60 columns; any more detail is lost to the grid anyway.
  ctx.fillStyle = "rgba(48,31,18,0.5)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      cx + s * rx * 0.38, headY - ry * 0.04,
      rx * 0.2, ry * 0.1, s * 0.12, 0, Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = "rgba(30,19,11,0.34)";
  ctx.beginPath();
  ctx.moveTo(cx + rx * 0.02, headY - ry * 0.05);
  ctx.quadraticCurveTo(cx + rx * 0.15, headY + ry * 0.24, cx - rx * 0.04, headY + ry * 0.3);
  ctx.quadraticCurveTo(cx - rx * 0.14, headY + ry * 0.22, cx + rx * 0.02, headY - ry * 0.05);
  ctx.fill();
  ctx.strokeStyle = "rgba(58,33,19,0.55)";
  ctx.lineWidth = w * 0.009;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.22, headY + ry * 0.48);
  ctx.quadraticCurveTo(cx, headY + ry * 0.56, cx + rx * 0.22, headY + ry * 0.48);
  ctx.stroke();

  // Rim light down the shadow side, drawn last so it sits over everything.
  ctx.save();
  ctx.filter = "blur(7px)";
  ctx.strokeStyle = "rgba(255,214,158,0.8)";
  ctx.lineWidth = w * 0.014;
  ctx.beginPath();
  ctx.ellipse(cx, headY, rx * 0.97, ry * 0.99, 0, -Math.PI * 0.38, Math.PI * 0.3);
  ctx.stroke();
  ctx.restore();

  // Vignette, so the corners stop competing with the face.
  ctx.fillStyle = radial(ctx, cx, h * 0.4, w * 0.42, w * 0.98, [
    [0, "rgba(0,0,0,0)"],
    [1, "rgba(0,0,0,0.5)"],
  ]);
  ctx.fillRect(0, 0, w, h);
}

function drawMesh(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = "#0a0a10";
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(20260906);
  const hues = [8, 34, 48, 190, 268, 320, 15];
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < hues.length; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = (0.28 + rng() * 0.34) * Math.max(w, h);
    ctx.fillStyle = radial(ctx, x, y, 0, r, [
      [0, `hsla(${hues[i]}, 92%, 62%, 0.85)`],
      [0.45, `hsla(${hues[i]}, 88%, 46%, 0.34)`],
      [1, "hsla(0, 0%, 0%, 0)"],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // A few hard-edged bars so the render has some high-frequency detail too.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.07})`;
    ctx.fillRect(rng() * w, 0, 3 + rng() * 10, h);
  }
}

function drawLandscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const horizon = h * 0.58;
  ctx.fillStyle = grad(ctx, 0, 0, 0, horizon, [
    [0, "#101a3a"],
    [0.45, "#5b3a5c"],
    [0.78, "#c96a3a"],
    [1, "#ffb85c"],
  ]);
  ctx.fillRect(0, 0, w, horizon);

  const sunX = w * 0.68;
  const sunY = horizon - h * 0.06;
  ctx.fillStyle = radial(ctx, sunX, sunY, 0, w * 0.3, [
    [0, "rgba(255,235,190,0.95)"],
    [0.25, "rgba(255,180,90,0.45)"],
    [1, "rgba(255,140,60,0)"],
  ]);
  ctx.fillRect(0, 0, w, horizon);
  ctx.fillStyle = "#fff2d4";
  ctx.beginPath();
  ctx.arc(sunX, sunY, w * 0.045, 0, Math.PI * 2);
  ctx.fill();

  // Three mountain layers, each darker and closer than the last.
  const rng = makeRng(4242);
  const layers: Array<[number, string, number]> = [
    [horizon - h * 0.2, "#4a3355", h * 0.13],
    [horizon - h * 0.1, "#2c1f38", h * 0.1],
    [horizon - h * 0.02, "#171122", h * 0.07],
  ];
  for (const [base, color, amp] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    let y = base;
    for (let x = 0; x <= w; x += w / 18) {
      y = base - (rng() - 0.35) * amp * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = grad(ctx, 0, horizon, 0, h, [
    [0, "#241a32"],
    [0.5, "#0f0c1a"],
    [1, "#05040a"],
  ]);
  ctx.fillRect(0, horizon, w, h - horizon);

  // Sun reflection: broken horizontal streaks, brightest near the horizon.
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const y = horizon + t * (h - horizon) * 0.85;
    const spread = w * (0.03 + t * 0.16);
    const alpha = (1 - t) * 0.5 * (0.5 + rng() * 0.5);
    ctx.fillStyle = `rgba(255,190,110,${alpha.toFixed(3)})`;
    ctx.fillRect(sunX - spread / 2, y, spread, 2 + t * 5);
  }
}

export const DEMO_IMAGES: DemoImage[] = [
  { id: "portrait", name: "Portrait", width: 860, height: 1080, draw: drawPortrait },
  { id: "mesh", name: "Colour mesh", width: 1080, height: 1080, draw: drawMesh },
  { id: "landscape", name: "Landscape", width: 1280, height: 800, draw: drawLandscape },
];

export async function renderDemo(demo: DemoImage): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = demo.width;
  canvas.height = demo.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  demo.draw(ctx, demo.width, demo.height);
  return createImageBitmap(canvas);
}
