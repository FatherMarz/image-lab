import type { ApplyFn } from "@/lib/ops/types";

type PicaInstance = Awaited<ReturnType<typeof makePica>>;

async function makePica() {
  const { default: pica } = await import("pica");
  // features:['js'] keeps pica from spawning its own workers — we're already inside
  // one, and nested workers are not worth the trouble here.
  return pica({ features: ["js"] });
}

let picaInstance: Promise<PicaInstance> | null = null;
function getPica(): Promise<PicaInstance> {
  if (!picaInstance) picaInstance = makePica();
  return picaInstance;
}

/**
 * Resize and upscale, both through Lanczos (pica). Canvas drawImage is bicubic at
 * best, which is visibly softer — the Python tool this replaces used Lanczos, so
 * matching it matters.
 */
export const resize: ApplyFn = async (ctx, input, params) => {
  const mode = String(params.mode);

  let toWidth: number;
  let toHeight: number;

  if (mode === "percent") {
    const pct = Number(params.percent) / 100;
    if (pct === 1) return input;
    toWidth = Math.round(input.width * pct);
    toHeight = Math.round(input.height * pct);
  } else {
    // Pixel targets are stated against the FULL-size image, so scale them down for
    // the preview render or the preview would resize to the wrong dimensions.
    toWidth = Math.round(Number(params.width) * ctx.scale);
    toHeight = Number(params.lockAspect)
      ? Math.round((toWidth / input.width) * input.height)
      : Math.round(Number(params.height) * ctx.scale);
  }

  toWidth = Math.max(1, Math.min(toWidth, 8192));
  toHeight = Math.max(1, Math.min(toHeight, 8192));
  if (toWidth === input.width && toHeight === input.height) return input;

  const pica = await getPica();
  const out = await pica.resizeBuffer({
    src: input.data,
    width: input.width,
    height: input.height,
    toWidth,
    toHeight,
    quality: 3,
  });

  return new ImageData(new Uint8ClampedArray(out), toWidth, toHeight);
};
