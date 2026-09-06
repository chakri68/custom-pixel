import type { MappingKey, PropertyMapping, RenderConfig } from "../types.ts";

/**
 * A ~40 line store beats pulling in Zustand for one object. `RenderConfig` is
 * the single source of truth; every control reads and writes through here.
 */

export type Listener = (config: RenderConfig) => void;

export interface Store {
  get(): RenderConfig;
  set(patch: Partial<RenderConfig>): void;
  setMapping(key: MappingKey, patch: Partial<PropertyMapping>): void;
  replace(next: RenderConfig): void;
  subscribe(fn: Listener): () => void;
}

export function createStore(initial: RenderConfig): Store {
  let config = initial;
  const listeners = new Set<Listener>();

  const notify = (): void => {
    for (const fn of listeners) fn(config);
  };

  return {
    get: () => config,
    set(patch) {
      config = { ...config, ...patch };
      notify();
    },
    setMapping(key, patch) {
      config = { ...config, [key]: { ...config[key], ...patch } };
      notify();
    },
    replace(next) {
      config = next;
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
