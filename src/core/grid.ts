import type { Cell, GridType, RenderConfig } from "../types.ts";
import { defaultGridFor } from "./primitives.ts";
import { hash3 } from "./rng.ts";

/**
 * Grid generators. Layout is driven by `columns`, never by a pixel cell size,
 * so exporting at 4x is a pure scale of the same composition rather than a
 * re-layout.
 *
 * Edge handling is the other thing happening here. `whole` sizes and centres
 * the field so it ends on complete shapes and then drops anything still
 * hanging over the boundary; `bleed` lets cells run off and be clipped by the
 * canvas. Offset rows are why this matters: a staggered or hex row starts half
 * a cell over, so without trimming every other row ends in a sliced shape.
 */

const SQRT3 = Math.sqrt(3);

/** Guard rail against a stray columns value locking up the worker. */
const MAX_CELLS = 500_000;

/** Sub-pixel slack, so a cell that fits exactly is not lost to float noise. */
const EDGE_EPS = 0.5;

export interface GridResult {
  cells: Cell[];
  /** Distance between neighbouring cell centres — sets the mip resolution. */
  pitch: number;
  truncated: boolean;
}

/** Half-extents of a cell's tiling footprint, as ratios of `Cell.size`. */
interface Footprint {
  hw: number;
  hh: number;
}

export function resolveGrid(config: RenderConfig): GridType {
  return config.gridType ?? defaultGridFor(config.primitive);
}

export function buildGrid(
  config: RenderConfig,
  W: number,
  H: number,
): GridResult {
  const grid = resolveGrid(config);
  const cell = W / Math.max(1, config.columns);
  const whole = config.edge !== "bleed";
  const cells: Cell[] = [];
  let pitch = cell;
  let footprint: Footprint = { hw: 0.5, hh: 0.5 };

  switch (grid) {
    case "rect":
    case "scatter":
      rectLike(cells, config, H, cell, whole, false, grid === "scatter");
      break;
    case "staggered":
      rectLike(cells, config, H, cell, whole, true, false);
      break;
    case "hex":
      footprint = hexGrid(cells, config, W, H, cell, whole);
      break;
    case "triangle":
      pitch = cell / 2;
      footprint = { hw: 0.5, hh: SQRT3 / 4 };
      triangleGrid(cells, config, W, H, cell, whole);
      break;
    case "polar":
      polarGrid(cells, config, W, H, cell);
      break;
  }

  const truncated = cells.length > MAX_CELLS;
  if (truncated) cells.length = MAX_CELLS;

  applyJitter(cells, config, cell);
  return {
    cells: whole ? trim(cells, footprint, W, H) : cells,
    pitch,
    truncated,
  };
}

/** Drops cells whose footprint escapes the canvas. Runs after jitter. */
function trim(cells: Cell[], fp: Footprint, W: number, H: number): Cell[] {
  return cells.filter((c) => {
    const hw = c.size * fp.hw;
    const hh = c.size * fp.hh;
    return (
      c.x - hw >= -EDGE_EPS &&
      c.x + hw <= W + EDGE_EPS &&
      c.y - hh >= -EDGE_EPS &&
      c.y + hh <= H + EDGE_EPS
    );
  });
}

function push(
  cells: Cell[],
  x: number,
  y: number,
  size: number,
  orientation: number,
  flip: 1 | -1,
  gx: number,
  gy: number,
): void {
  if (cells.length > MAX_CELLS) return;
  cells.push({ index: cells.length, x, y, size, orientation, flip, gx, gy });
}

/** Whole rows that fit, or enough to cover plus overhang. */
function rowCount(H: number, pitch: number, whole: boolean): number {
  return Math.max(
    1,
    whole ? Math.floor(H / pitch + 1e-9) : Math.ceil(H / pitch),
  );
}

function rectLike(
  cells: Cell[],
  config: RenderConfig,
  H: number,
  cell: number,
  whole: boolean,
  stagger: boolean,
  scatter: boolean,
): void {
  const cols = Math.max(1, Math.round(config.columns));
  const rows = rowCount(H, cell, whole);
  const yOff = (H - rows * cell) / 2 + config.rowOffset * cell;
  const xOff = config.colOffset * cell;
  for (let j = 0; j < rows; j++) {
    const odd = stagger && j % 2 === 1;
    // Odd rows sit on the half-step. Bleeding, they need an extra cell to
    // reach both edges; trimmed, the two end cells would be halves anyway.
    const from = odd && whole ? 1 : 0;
    const to = odd ? (whole ? cols - 1 : cols) : cols - 1;
    for (let i = from; i <= to; i++) {
      let x = xOff + (odd ? i * cell : (i + 0.5) * cell);
      let y = yOff + (j + 0.5) * cell;
      if (scatter) {
        const idx = j * (cols + 2) + i;
        x += (hash3(config.seed, idx, 7) - 0.5) * cell;
        y += (hash3(config.seed, idx, 8) - 0.5) * cell;
      }
      push(cells, x, y, cell, 0, 1, i, j);
    }
  }
}

function hexGrid(
  cells: Cell[],
  config: RenderConfig,
  W: number,
  H: number,
  cell: number,
  whole: boolean,
): Footprint {
  const xOff = config.colOffset * cell;

  if (config.hexOrientation === "pointy") {
    // Flats are `cell` apart horizontally; rows interlock at sqrt(3)/2 of
    // that. R is half the point-to-point height, which is what overhangs.
    const dx = cell;
    const dy = cell * (SQRT3 / 2);
    const R = cell / SQRT3;
    const cols = Math.max(1, Math.round(config.columns));

    // Hexagons cannot give a flat top edge, so a trimmed field is sized to
    // the zigzag: first and last rows touch the boundary with their points.
    const rows = whole
      ? Math.max(1, Math.floor((H - 2 * R) / dy + 1e-9) + 1)
      : Math.ceil(H / dy) + 1;
    const fieldH = (rows - 1) * dy + (whole ? 2 * R : 0);
    const y0 = (H - fieldH) / 2 + (whole ? R : 0) + config.rowOffset * dy;

    for (let j = 0; j < rows; j++) {
      const odd = j % 2 === 1;
      const from = odd && whole ? 1 : 0;
      const to = odd ? (whole ? cols - 1 : cols) : cols - 1;
      for (let i = from; i <= to; i++) {
        const x = xOff + (odd ? i * dx : (i + 0.5) * dx);
        push(cells, x, y0 + j * dy, cell, 0, 1, i, j);
      }
    }
    return { hw: 0.5, hh: 1 / SQRT3 };
  }

  // Flat-top: `s` tall flat-to-flat, columns step 3/4 of the point-to-point
  // width, which works out to cell = 0.866 * s. Now the overhang is sideways,
  // so the column count is what has to shrink to fit.
  const s = cell * (2 / SQRT3);
  const R = s / SQRT3;
  const cols = whole
    ? Math.max(1, Math.floor((W - 2 * R) / cell + 1e-9) + 1)
    : Math.max(1, Math.round(config.columns));
  const fieldW = (cols - 1) * cell + (whole ? 2 * R : 0);
  const x0 = (W - fieldW) / 2 + (whole ? R : 0) + xOff;

  const rows = rowCount(H, s, whole);
  const yOff = (H - rows * s) / 2 + config.rowOffset * s;
  for (let i = 0; i < cols; i++) {
    const odd = i % 2 === 1;
    // Offset columns lose one cell off the bottom; trim() takes it.
    for (let j = 0; j < rows + (odd ? 1 : 0); j++) {
      const y = yOff + (j + (odd ? 1 : 0.5)) * s;
      push(cells, x0 + i * cell, y, s, 0, 1, i, j);
    }
  }
  return { hw: 1 / SQRT3, hh: 0.5 };
}

function triangleGrid(
  cells: Cell[],
  config: RenderConfig,
  W: number,
  H: number,
  cell: number,
  whole: boolean,
): void {
  // Base `cell`, height sqrt(3)/2 * cell. Neighbours step half a base and
  // alternate their vertical mirror, which is exactly the complement shape.
  const dx = cell / 2;
  const dy = cell * (SQRT3 / 2);
  // Triangles are a base wide but only half a base apart, so the two end
  // positions of every row are halves off the edge.
  const from = whole ? 1 : 0;
  const to = whole
    ? Math.floor((W - cell / 2) / dx + 1e-9)
    : Math.ceil(W / dx) + 1;
  const rows = rowCount(H, dy, whole);
  const yOff = (H - rows * dy) / 2 + config.rowOffset * dy;
  const xOff = config.colOffset * cell;
  for (let j = 0; j < rows; j++) {
    for (let i = from; i <= to; i++) {
      const flip: 1 | -1 = (i + j) % 2 === 0 ? 1 : -1;
      push(cells, xOff + i * dx, yOff + (j + 0.5) * dy, cell, 0, flip, i, j);
    }
  }
}

function polarGrid(
  cells: Cell[],
  config: RenderConfig,
  W: number,
  H: number,
  cell: number,
): void {
  const cx = W / 2 + config.colOffset * cell;
  const cy = H / 2 + config.rowOffset * cell;
  const maxR = Math.hypot(W, H) / 2;
  const rings = Math.max(1, Math.ceil(maxR / cell));
  push(cells, cx, cy, cell, 0, 1, 0, 0);
  for (let k = 1; k <= rings; k++) {
    const r = k * cell;
    const count = Math.max(1, Math.round((2 * Math.PI * r) / cell));
    // Half-step every other ring so spokes do not line up into visible seams.
    const phase = k % 2 === 1 ? Math.PI / count : 0;
    for (let m = 0; m < count; m++) {
      const a = (m / count) * Math.PI * 2 + phase;
      push(
        cells,
        cx + r * Math.cos(a),
        cy + r * Math.sin(a),
        cell,
        (a * 180) / Math.PI + 90,
        1,
        m,
        k,
      );
    }
  }
}

function applyJitter(cells: Cell[], config: RenderConfig, cell: number): void {
  const j = config.jitter;
  if (j <= 0) return;
  const seed = config.seed;
  for (const c of cells) {
    c.x += (hash3(seed, c.index, 0) - 0.5) * cell * j;
    c.y += (hash3(seed, c.index, 1) - 0.5) * cell * j;
    c.orientation += (hash3(seed, c.index, 2) - 0.5) * 90 * j;
    c.size *= 1 + (hash3(seed, c.index, 3) - 0.5) * 0.6 * j;
  }
}
