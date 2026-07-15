import type { Op } from "./ops/types";
import type { ExportFormat, Request, Response } from "./protocol";

type Loaded = Extract<Response, { kind: "loaded" }>;
type Rendered = Extract<Response, { kind: "rendered" }>;
type Exported = Extract<Response, { kind: "exported" }>;

type Pending = {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
};

/** Plain Omit collapses a union into its shared keys; this keeps each variant intact. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

class PipelineClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(
      new URL("../workers/pipeline.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.kind === "error") p.reject(new Error(msg.message));
      else p.resolve(msg as never);
    };
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

  render(ops: Op[], maxDim: number) {
    return this.send<Rendered>({ kind: "render", ops, maxDim });
  }

  exportImage(ops: Op[], format: ExportFormat, quality: number) {
    return this.send<Exported>({ kind: "export", ops, format, quality });
  }
}

export const pipeline = new PipelineClient();
