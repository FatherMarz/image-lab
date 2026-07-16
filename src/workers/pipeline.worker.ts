/// <reference lib="webworker" />
import { metaFor } from "@/lib/ops/registry";
import type { Op, OpContext } from "@/lib/ops/types";
import type { Request, Response } from "@/lib/protocol";
import type { TraceParams } from "@/lib/trace";
import { MAX_PIXELS, PREVIEW_MAX } from "@/lib/consts";
import { setAsset } from "./assets";
import { APPLY } from "./ops";
import { extractPalette } from "./palette";

type CacheEntry = { key: string; data: ImageData };

let source: ImageBitmap | null = null;

/** Base ImageData per maxDim. Full-res (maxDim 0) is never cached — it's one-shot on export. */
const baseCache = new Map<number, ImageData>();
/** Prefix caches per base key, so an export never evicts the live preview's cache. */
const prefixes = new Map<string, CacheEntry[]>();

function post(msg: Response, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function stable(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join(",");
}

function dimsFor(maxDim: number) {
  const sw = source!.width;
  const sh = source!.height;
  if (!maxDim) return { w: sw, h: sh };
  const s = Math.min(1, maxDim / Math.max(sw, sh));
  return { w: Math.max(1, Math.round(sw * s)), h: Math.max(1, Math.round(sh * s)) };
}

function drawToImageData(bmp: ImageBitmap, w: number, h: number): ImageData {
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "high";
  cx.drawImage(bmp, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h);
}

function baseFor(maxDim: number): ImageData {
  const cached = baseCache.get(maxDim);
  if (cached) return cached;
  const { w, h } = dimsFor(maxDim);
  const data = drawToImageData(source!, w, h);
  if (maxDim) baseCache.set(maxDim, data);
  return data;
}

async function runPipeline(
  ops: Op[],
  maxDim: number,
  requestId: number,
): Promise<ImageData> {
  if (!source) throw new Error("No image loaded");

  const { w, h } = dimsFor(maxDim);
  const base = baseFor(maxDim);
  const baseKey = `${w}x${h}`;

  // Disabled ops contribute nothing to the key, so toggling one off reuses the
  // cache from before it was ever added.
  const keys: string[] = [];
  let acc = baseKey;
  for (const op of ops) {
    if (op.enabled) acc += `|${op.type}:${stable(op.params)}`;
    keys.push(acc);
  }

  const useCache = maxDim > 0;
  let prefix = prefixes.get(baseKey);
  if (!prefix) {
    prefix = [];
    if (useCache) prefixes.set(baseKey, prefix);
  }

  // Walk back to the deepest still-valid cached result and resume from there.
  let start = 0;
  let current: ImageData = base;
  if (useCache) {
    for (let i = ops.length - 1; i >= 0; i--) {
      if (prefix[i] && prefix[i].key === keys[i]) {
        current = prefix[i].data;
        start = i + 1;
        break;
      }
    }
  }

  for (let i = start; i < ops.length; i++) {
    const op = ops[i];
    if (op.enabled) {
      const fn = APPLY[op.type];
      if (!fn) throw new Error(`No implementation for op: ${op.type}`);
      const params = { ...metaFor(op.type).defaults, ...op.params };
      const ctx: OpContext = {
        scale: w / source.width,
        inputKey: i === 0 ? baseKey : keys[i - 1],
        report: (phase, loaded, total) =>
          post({ kind: "progress", id: requestId, phase, loaded, total }),
      };
      current = await fn(ctx, current, params);
    }
    if (useCache) prefix[i] = { key: keys[i], data: current };
  }
  if (useCache) prefix.length = ops.length;

  return current;
}

/**
 * The one tracer call. Preview and export both route through here so what the viewport
 * shows and what downloads can't drift apart.
 *
 * VTracer, not ImageTracer: measured on a wordmark, ImageTracer needed 217 paths and
 * still wobbled the curves and fringed the letters, where this does it in 15 clean ones.
 */
async function toSvg(data: ImageData, p: TraceParams): Promise<string> {
  const { TracerConfig, ColorMode, PathSimplifyMode, convertImageToSvg } =
    await import("wasm_vtracer");

  // Line art goes through the colour path on a black-and-white image rather than
  // VTracer's ColorMode.Binary, which returns a single unfilled path spanning the whole
  // frame for any source without a white background — a photo came back as one black
  // rectangle. Thresholding here is what Potrace expects anyway, and it buys a real
  // knob instead of an opaque built-in cutoff.
  const input = p.mode === "lineart" ? binarize(data, p.threshold) : data;

  const cfg = new TracerConfig();
  try {
    // A fresh TracerConfig defaults to pixel-art settings, so every field is set
    // explicitly rather than relying on the constructor.
    cfg.setColorMode(ColorMode.Color);
    // Polygon, never None: None keeps raw pixel edges, which turned a 512x342 photo
    // into 82,911 paths and 5.8MB.
    cfg.setPathSimplifyMode(
      p.mode === "pixel" ? PathSimplifyMode.Polygon : PathSimplifyMode.Spline,
    );
    // Two maximally distant colours: keep them apart rather than letting the colour
    // knobs merge the ink back into the paper.
    cfg.setColorPrecision(p.mode === "lineart" ? 8 : p.colorDetail);
    cfg.setLayerDifference(p.mode === "lineart" ? 0 : p.mergeSimilar);
    cfg.setFilterSpeckle(p.despeckle);
    cfg.setCornerThreshold(p.corners);
    cfg.setSpliceThreshold(p.smoothing);
    return convertImageToSvg(new Uint8Array(input.data), input.width, input.height, cfg);
  } finally {
    cfg.free();
  }
}

/** Luminance split into ink and paper. Transparent pixels count as paper, so tracing a
 * cutout gives its silhouette rather than a frame-filling block. */
function binarize(d: ImageData, threshold: number): ImageData {
  const out = new ImageData(d.width, d.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const a = d.data[i + 3];
    const lum =
      0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
    const ink = a >= 128 && lum < threshold;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = ink ? 0 : 255;
    out.data[i + 3] = 255;
  }
  return out;
}

async function encode(
  data: ImageData,
  format: string,
  quality: number,
): Promise<Blob> {
  // Vector never reaches here: rasterizing SVG needs an <img>, which a worker has no
  // access to, so PipelineClient.exportImage handles it on the main thread.
  if (format === "image/svg+xml") {
    throw new Error("SVG export must go through PipelineClient, not the worker");
  }

  const c = new OffscreenCanvas(data.width, data.height);
  const cx = c.getContext("2d")!;

  if (format === "image/jpeg") {
    // JPEG has no alpha channel. putImageData ignores compositing, so transparent
    // pixels would land as black. Flatten onto white through drawImage instead.
    const tmp = new OffscreenCanvas(data.width, data.height);
    tmp.getContext("2d")!.putImageData(data, 0, 0);
    cx.fillStyle = "#ffffff";
    cx.fillRect(0, 0, data.width, data.height);
    cx.drawImage(tmp, 0, 0);
  } else {
    cx.putImageData(data, 0, 0);
  }

  return c.convertToBlob({ type: format, quality });
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    switch (msg.kind) {
      case "load": {
        let src = msg.bitmap;
        let downscaledFrom: { width: number; height: number } | undefined;

        if (src.width * src.height > MAX_PIXELS) {
          const s = Math.sqrt(MAX_PIXELS / (src.width * src.height));
          const w = Math.round(src.width * s);
          const h = Math.round(src.height * s);
          downscaledFrom = { width: src.width, height: src.height };
          const c = new OffscreenCanvas(w, h);
          const cx = c.getContext("2d")!;
          cx.imageSmoothingQuality = "high";
          cx.drawImage(src, 0, 0, w, h);
          src.close();
          src = c.transferToImageBitmap();
        }

        source?.close();
        source = src;
        baseCache.clear();
        prefixes.clear();

        const preview = await createImageBitmap(baseFor(PREVIEW_MAX));
        post(
          {
            kind: "loaded",
            id: msg.id,
            width: src.width,
            height: src.height,
            downscaledFrom,
            preview,
          },
          [preview],
        );
        break;
      }

      case "asset": {
        setAsset(msg.assetId, msg.bitmap);
        post({ kind: "ack", id: msg.id });
        break;
      }

      case "render": {
        const data = await runPipeline(msg.ops, msg.maxDim, msg.id);
        const bitmap = await createImageBitmap(data);
        post(
          { kind: "rendered", id: msg.id, bitmap, width: data.width, height: data.height },
          [bitmap],
        );
        break;
      }

      case "probe": {
        const data = await runPipeline(msg.ops, msg.maxDim, msg.id);
        post({ kind: "probed", id: msg.id, swatches: extractPalette(data, msg.count) });
        break;
      }

      case "trace": {
        const data = await runPipeline(msg.ops, msg.maxDim, msg.id);
        // Tracing is seconds, not milliseconds, on a busy image — say so rather than
        // leaving the viewport looking hung.
        post({ kind: "progress", id: msg.id, phase: "tracing" });
        const svg = await toSvg(data, msg.trace);
        post({ kind: "traced", id: msg.id, svg, width: data.width, height: data.height });
        break;
      }

      case "export": {
        const data = await runPipeline(msg.ops, 0, msg.id);
        const blob = await encode(data, msg.format, msg.quality);
        post({
          kind: "exported",
          id: msg.id,
          blob,
          width: data.width,
          height: data.height,
        });
        break;
      }
    }
  } catch (err) {
    post({
      kind: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
