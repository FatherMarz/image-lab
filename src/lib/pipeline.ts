import type { Op } from "./ops/types";
import type { ExportFormat, Request, Response } from "./protocol";

type Loaded = Extract<Response, { kind: "loaded" }>;
type Rendered = Extract<Response, { kind: "rendered" }>;
type Exported = Extract<Response, { kind: "exported" }>;
type Ack = Extract<Response, { kind: "ack" }>;
type Probed = Extract<Response, { kind: "probed" }>;

export type Progress = { phase: string; loaded?: number; total?: number };

type Pending = {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
};

/** Plain Omit collapses a union into its shared keys; this keeps each variant intact. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Exported so batch runs can spin up their own worker instead of clobbering the
 * source image the user is currently editing. */
export class PipelineClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private progressSubs = new Set<(p: Progress | null) => void>();

  constructor() {
    this.worker = new Worker(
      new URL("../workers/pipeline.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const msg = e.data;

      // Progress is a side channel: it reports on an in-flight request without
      // settling it, so it must not touch `pending`.
      if (msg.kind === "progress") {
        const p: Progress = { phase: msg.phase, loaded: msg.loaded, total: msg.total };
        this.progressSubs.forEach((cb) => cb(p));
        return;
      }

      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (this.pending.size === 0) this.progressSubs.forEach((cb) => cb(null));
      if (msg.kind === "error") pending.reject(new Error(msg.message));
      else pending.resolve(msg as never);
    };
  }

  onProgress(cb: (p: Progress | null) => void) {
    this.progressSubs.add(cb);
    return () => this.progressSubs.delete(cb);
  }

  private send<T>(
    msg: DistributiveOmit<Request, "id">,
    transfer: Transferable[] = [],
  ): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as Pending["resolve"], reject });
      this.worker.postMessage({ ...msg, id } as Request, transfer);
    });
  }

  load(bitmap: ImageBitmap) {
    return this.send<Loaded>({ kind: "load", bitmap }, [bitmap]);
  }

  setAsset(assetId: string, bitmap: ImageBitmap) {
    return this.send<Ack>({ kind: "asset", assetId, bitmap }, [bitmap]);
  }

  render(ops: Op[], maxDim: number) {
    return this.send<Rendered>({ kind: "render", ops, maxDim });
  }

  palette(ops: Op[], maxDim: number, count: number) {
    return this.send<Probed>({ kind: "probe", ops, maxDim, count });
  }

  exportImage(ops: Op[], format: ExportFormat, quality: number) {
    return this.send<Exported>({ kind: "export", ops, format, quality });
  }

  dispose() {
    this.worker.terminate();
  }
}

export const pipeline = new PipelineClient();
