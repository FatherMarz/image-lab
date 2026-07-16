import { VECTOR } from "./formats";
import type { Op, OpParams } from "./ops/types";
import type { ExportFormat } from "./protocol";

/**
 * How the tracer reads the image. This is the knob that matters — the rest are tuning.
 *
 *  color   Colour regions, smooth curves. Logos, artwork, photos. The default.
 *  lineart Black/white silhouette, smooth curves. Sketches, scans, stamps.
 *  pixel   Straight edges, no curve fitting. Pixel art and hard-edged UI only.
 */
export type TraceMode = "color" | "lineart" | "pixel";

/** The Vectorize tool's knobs. Each maps onto one VTracer setting. */
export interface TraceParams {
  mode: TraceMode;
  colorDetail: number;
  mergeSimilar: number;
  despeckle: number;
  corners: number;
  smoothing: number;
  /** Line art only: luminance below this becomes ink, above it becomes paper. */
  threshold: number;
}

/** VTracer's own defaults, which are well-tuned. Mode and threshold are ours. */
export const TRACE_DEFAULTS: TraceParams = {
  mode: "color",
  colorDetail: 6,
  mergeSimilar: 16,
  despeckle: 4,
  corners: 60,
  smoothing: 45,
  threshold: 128,
};

/** Knobs that do nothing in the current mode, so the panel can hide them. */
export function inertControls(mode: TraceMode): string[] {
  return mode === "lineart"
    ? ["colorDetail", "mergeSimilar"]
    : ["threshold"];
}

export function traceParamsFrom(params: OpParams): TraceParams {
  return {
    mode: (String(params.mode ?? TRACE_DEFAULTS.mode) as TraceMode) || "color",
    colorDetail: Number(params.colorDetail ?? TRACE_DEFAULTS.colorDetail),
    mergeSimilar: Number(params.mergeSimilar ?? TRACE_DEFAULTS.mergeSimilar),
    despeckle: Number(params.despeckle ?? TRACE_DEFAULTS.despeckle),
    corners: Number(params.corners ?? TRACE_DEFAULTS.corners),
    smoothing: Number(params.smoothing ?? TRACE_DEFAULTS.smoothing),
    threshold: Number(params.threshold ?? TRACE_DEFAULTS.threshold),
  };
}

/**
 * The trace settings in force, or null if nothing should be traced.
 *
 * The Vectorize tool owns them when it's in the stack. Failing that, SVG still has to
 * come out as vector, so it falls back to defaults — picking the format alone is
 * enough to get a trace, without the tool.
 */
export function traceFor(ops: Op[], format: ExportFormat): TraceParams | null {
  const op = ops.find((o) => o.type === "vectorize" && o.enabled);
  if (op) return traceParamsFrom(op.params);
  if (VECTOR.includes(format)) return { ...TRACE_DEFAULTS };
  return null;
}
