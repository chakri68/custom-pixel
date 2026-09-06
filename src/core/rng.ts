/**
 * Seeded randomness. Every stochastic decision in the renderer routes through
 * here so a preset or shared URL reproduces byte-for-byte.
 */

/** Stateless hash -> [0, 1). Lets any cell ask for its own noise out of order. */
export function hash01(seed: number, i: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (i + 0x165667b1), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h / 4294967296;
}

/** Three decorrelated draws for one cell (x jitter, y jitter, rotation...). */
export function hash3(seed: number, i: number, stream: number): number {
  return hash01(seed + stream * 0x27d4eb2d, i);
}

/** mulberry32 — small, fast, good enough for jitter. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
