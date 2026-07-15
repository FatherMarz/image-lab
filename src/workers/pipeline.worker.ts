/// <reference lib="webworker" />
import { metaFor } from "@/lib/ops/registry";
import type { Op, OpContext } from "@/lib/ops/types";
import type { Request, Response } from "@/lib/protocol";
import { MAX_PIXELS, PREVIEW_MAX } from "@/lib/consts";
import { APPLY } from "./ops";

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

async function runPipeline(ops: Op[], maxDim: number): Promise<ImageData> {
  if (!source) throw new Error("No image loaded");

  const { w, h } = dimsFor(maxDim);
  const base = baseFor(maxDim);
  const ctx: OpContext = { scale: w / source.width };
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
      current = await fn(ctx, current, params);
    }
    if (useCache) prefix[i] = { key: keys[i], data: current };
  }
  if (useCache) prefix.length = ops.length;

  return current;
}

async function encode(
  data: ImageData,
  format: string,
  quality: number,
): Promise<Blob> {
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

      case "render": {
        const data = await runPipeline(msg.ops, msg.maxDim);
        const bitmap = await createImageBitmap(data);
        post(
          { kind: "rendered", id: msg.id, bitmap, width: data.width, height: data.height },
          [bitmap],
        );
        break;
      }

      case "export": {
        const data = await runPipeline(msg.ops, 0);
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
