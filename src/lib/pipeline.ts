import { HAS_ALPHA, VECTOR } from "./formats";
import { metaFor } from "./ops/registry";
import type { Op } from "./ops/types";
import type { ExportFormat, Request, Response } from "./protocol";
import { svgToBitmap } from "./svg";
import { traceFor, type TraceParams } from "./trace";

type Loaded = Extract<Response, { kind: "loaded" }>;
type Rendered = Extract<Response, { kind: "rendered" }>;
type Traced = Extract<Response, { kind: "traced" }>;
type Exported = Extract<Response, { kind: "exported" }>;
type Ack = Extract<Response, { kind: "ack" }>;
type Probed = Extract<Response, { kind: "probed" }>;

export type Progress = { phase: string; loaded?: number; total?: number };

/** What exportImage hands back. The worker's own `exported` carries protocol fields
 * the callers never read, and the vector path doesn't go through the worker at all. */
export type ExportResult = { blob: Blob; width: number; height: number };

/**
 * Terminal ops (Vectorize) have no worker implementation, so every request that runs
 * the pipeline drops them first. Centralised here rather than at the call sites —
 * PalettePanel hands its stack straight to the worker and would otherwise throw the
 * moment someone added the tool.
 */
function stripTerminal(ops: Op[]): Op[] {
  return ops.filter((o) => !metaFor(o.type).terminal);
}

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
    return this.send<Rendered>({ kind: "render", ops: stripTerminal(ops), maxDim });
  }

  palette(ops: Op[], maxDim: number, count: number) {
    return this.send<Probed>({ kind: "probe", ops: stripTerminal(ops), maxDim, count });
  }

  trace(ops: Op[], maxDim: number, trace: TraceParams) {
    return this.send<Traced>({ kind: "trace", ops: stripTerminal(ops), maxDim, trace });
  }

  /**
   * Vector export can't run in the worker — rasterizing SVG needs an <img>, and Chrome
   * won't decode it through createImageBitmap on either thread. So when a trace is in
   * force the worker returns markup and this finishes the job on the main thread.
   *
   * Living here means batch runs and icon sets get it for free; both already call this.
   */
  async exportImage(
    ops: Op[],
    format: ExportFormat,
    quality: number,
  ): Promise<ExportResult> {
    const params = traceFor(ops, format);
    if (!params) {
      return this.send<Exported>({ kind: "export", ops, format, quality });
    }

    const { svg, width, height } = await this.trace(ops, 0, params);
    if (VECTOR.includes(format)) {
      return { blob: new Blob([svg], { type: format }), width, height };
    }

    // Raster export of a traced image: what the viewport showed, as pixels.
    const bmp = await svgToBitmap(svg, width, height);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const cx = c.getContext("2d")!;
    // Same reason as the worker's encode(): formats without alpha would land
    // transparent pixels as black.
    if (!HAS_ALPHA.includes(format)) {
      cx.fillStyle = "#ffffff";
      cx.fillRect(0, 0, width, height);
    }
    cx.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, format, quality));
    if (!blob) throw new Error(`Could not encode ${format}`);
    return { blob, width, height };
  }

  dispose() {
    this.worker.terminate();
  }
}

export const pipeline = new PipelineClient();
