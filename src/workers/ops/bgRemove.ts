import type { ApplyFn, OpContext } from "@/lib/ops/types";

type ModelKind = "general" | "people";
type Device = "webgpu" | "wasm";

/**
 * Both models are IS-Net derivatives, which is the only architecture verified to
 * actually run in a browser (see probe.html). Everything else was measured and
 * rejected: BiRefNet_lite exceeds WebGPU's per-shader storage-buffer limit (needs 11,
 * Macs allow 10) AND runs out of memory on WASM at every dtype; BEN2 (219MB) never
 * finishes loading; U-2-Netp's "u2net" model_type isn't registered in transformers.js.
 *
 * ISNet is AGPL-3.0, which is why this project is AGPL-3.0 — it was the only
 * general-purpose model that works at all. ormbg is kept for people because it's
 * genuinely better on portraits, not as a fallback.
 */
export const MODELS: Record<
  ModelKind,
  { repo: string; label: string; licence: string }
> = {
  general: {
    repo: "onnx-community/ISNet-ONNX",
    label: "Anything",
    licence: "AGPL-3.0",
  },
  people: {
    repo: "onnx-community/ormbg-ONNX",
    label: "People",
    licence: "Apache-2.0",
  },
};

/**
 * dtype is chosen by device, not by taste. fp16 is a hard error on the WASM backend
 * (std::bad_alloc), and int8 is both smaller and fine there.
 */
const PROFILE: Record<Device, { dtype: string; bytes: number }> = {
  webgpu: { dtype: "fp16", bytes: 88_100_000 },
  wasm: { dtype: "int8", bytes: 44_300_000 },
};

type Segmenter = (input: unknown) => Promise<unknown>;

let devicePromise: Promise<Device> | null = null;
function pickDevice(): Promise<Device> {
  if (!devicePromise) {
    devicePromise = (async () => {
      try {
        const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        if (!gpu) return "wasm";
        return (await gpu.requestAdapter()) ? "webgpu" : "wasm";
      } catch {
        return "wasm";
      }
    })();
  }
  return devicePromise;
}

const segmenters = new Map<ModelKind, Promise<Segmenter>>();

/** Segmentation is the expensive part; threshold/feather re-run against this. */
const maskCache = new Map<string, { width: number; height: number; alpha: Uint8ClampedArray }>();
const MASK_CACHE_MAX = 4;

async function getSegmenter(kind: ModelKind, ctx: OpContext): Promise<Segmenter> {
  const existing = segmenters.get(kind);
  if (existing) return existing;

  const promise = (async () => {
    // Dynamic import so transformers.js (and the ORT runtime) only ship to users
    // who actually remove a background.
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;

    const model = MODELS[kind];
    const progress_callback = (p: {
      status: string;
      loaded?: number;
      total?: number;
    }) => {
      if (p.status === "progress") ctx.report("downloading", p.loaded, p.total);
    };

    const device = await pickDevice();
    const load = (d: Device) =>
      pipeline("background-removal", model.repo, {
        dtype: PROFILE[d].dtype,
        device: d,
        progress_callback,
      } as never) as unknown as Promise<Segmenter>;

    try {
      const seg = await load(device);
      console.info(`[image-lab] ${model.repo} ${PROFILE[device].dtype} on ${device}`);
      return seg;
    } catch (err) {
      if (device === "wasm") throw err;
      // WebGPU can fail at load or first run (driver limits differ per machine), so
      // retry on WASM rather than leaving the user with nothing.
      console.warn("[image-lab] webgpu failed, retrying on wasm", err);
      const seg = await load("wasm");
      console.info(`[image-lab] ${model.repo} ${PROFILE.wasm.dtype} on wasm`);
      return seg;
    }
  })();

  segmenters.set(kind, promise);
  promise.catch(() => segmenters.delete(kind)); // let a failed load be retried
  return promise;
}

/** Separable box blur over the alpha plane. Three passes approximates a gaussian. */
function blurAlpha(a: Uint8ClampedArray, w: number, h: number, radius: number) {
  // Copy here rather than at the call site so src and dst share a buffer type and
  // the ping-pong swap below type-checks.
  let src = new Uint8ClampedArray(a);
  let dst = new Uint8ClampedArray(a.length);
  if (radius < 1) return src;
  for (let pass = 0; pass < 3; pass++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum / (radius * 2 + 1);
        const out = row + Math.min(w - 1, Math.max(0, x - radius));
        const inn = row + Math.min(w - 1, Math.max(0, x + radius + 1));
        sum += src[inn] - src[out];
      }
    }
    [src, dst] = [dst, src];
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum / (radius * 2 + 1);
        const out = Math.min(h - 1, Math.max(0, y - radius)) * w + x;
        const inn = Math.min(h - 1, Math.max(0, y + radius + 1)) * w + x;
        sum += src[inn] - src[out];
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const bgRemove: ApplyFn = async (ctx, input, params) => {
  const kind: ModelKind = params.model === "people" ? "people" : "general";
  const threshold = Number(params.threshold) / 100;
  const feather = Number(params.feather);

  const key = `${ctx.inputKey}:${kind}`;
  let cached = maskCache.get(key);

  if (!cached) {
    const segmenter = await getSegmenter(kind, ctx);
    ctx.report("segmenting");

    const { RawImage } = await import("@huggingface/transformers");
    const raw = new RawImage(
      new Uint8ClampedArray(input.data),
      input.width,
      input.height,
      4,
    );

    const result = await segmenter(raw);
    const out = (Array.isArray(result) ? result[0] : result) as {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      channels: number;
    };

    // The pipeline returns RGBA with alpha carrying the mask; lift the alpha plane out.
    if (out.channels !== 4) {
      throw new Error(`Unexpected mask output: ${out.channels} channels`);
    }
    const alpha = new Uint8ClampedArray(out.width * out.height);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = out.data[p];

    cached = { width: out.width, height: out.height, alpha };
    maskCache.set(key, cached);
    if (maskCache.size > MASK_CACHE_MAX) {
      maskCache.delete(maskCache.keys().next().value as string);
    }
  }

  if (cached.width !== input.width || cached.height !== input.height) {
    throw new Error(
      `Mask ${cached.width}x${cached.height} does not match input ${input.width}x${input.height}`,
    );
  }

  let alpha = cached.alpha;
  if (feather > 0) {
    alpha = blurAlpha(
      alpha,
      input.width,
      input.height,
      Math.max(1, Math.round(feather * ctx.scale)),
    );
  }

  // Smoothstep around the threshold rather than a hard cut, so hair and soft edges
  // survive. Lower threshold keeps more foreground; higher trims harder.
  const lo = Math.max(0, threshold - 0.15);
  const hi = Math.min(1, threshold + 0.15);

  const result = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = result.data;
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
    const a = smoothstep(lo, hi, alpha[i] / 255);
    // Multiply so an upstream op's alpha is respected rather than overwritten.
    d[p] = d[p] * a;
  }
  return result;
};
