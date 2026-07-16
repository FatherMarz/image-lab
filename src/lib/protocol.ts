import type { Op } from "./ops/types";
import type { TraceParams } from "./trace";

export type ExportFormat =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/avif"
  /** Produced by the Vectorize tool (a terminal op) rather than a canvas codec. The
   * worker traces; the main thread rasterizes for preview. See OpMeta.terminal. */
  | "image/svg+xml";

export type Request =
  | { kind: "load"; id: number; bitmap: ImageBitmap }
  /** Side images an op needs (a replacement backdrop), referenced by params.assetId. */
  | { kind: "asset"; id: number; assetId: string; bitmap: ImageBitmap }
  | { kind: "render"; id: number; ops: Op[]; maxDim: number }
  /** Reads the rendered result without mutating it (palette extraction). */
  | { kind: "probe"; id: number; ops: Op[]; maxDim: number; count: number }
  /** Renders then traces. The only tracer path there is: the viewport rasterizes this
   * for the preview and export turns the same markup into the downloaded file, so the
   * two can't drift. Callers must strip terminal ops from `ops` first. */
  | { kind: "trace"; id: number; ops: Op[]; maxDim: number; trace: TraceParams }
  | {
      kind: "export";
      id: number;
      ops: Op[];
      format: ExportFormat;
      quality: number;
    };

export type Response =
  | {
      kind: "progress";
      id: number;
      phase: string;
      loaded?: number;
      total?: number;
    }
  | {
      kind: "loaded";
      id: number;
      width: number;
      height: number;
      /** Set when the source exceeded MAX_PIXELS and was downscaled on load. */
      downscaledFrom?: { width: number; height: number };
      preview: ImageBitmap;
    }
  | { kind: "ack"; id: number }
  | { kind: "probed"; id: number; swatches: { hex: string; share: number }[] }
  | { kind: "rendered"; id: number; bitmap: ImageBitmap; width: number; height: number }
  | { kind: "traced"; id: number; svg: string; width: number; height: number }
  | { kind: "exported"; id: number; blob: Blob; width: number; height: number }
  | { kind: "error"; id: number; message: string };
