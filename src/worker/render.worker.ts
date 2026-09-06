/// <reference lib="webworker" />
import { createEngine } from "./engine.ts";
import type { MainToWorker, WorkerToMain } from "./protocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

const handle = createEngine((msg: WorkerToMain, transfer?: Transferable[]) => {
  ctx.postMessage(msg, transfer ?? []);
});

ctx.onmessage = (ev: MessageEvent<MainToWorker>) => void handle(ev.data);
ctx.postMessage({ type: "ready" } satisfies WorkerToMain);
