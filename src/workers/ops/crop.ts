import type { ApplyFn } from "@/lib/ops/types";

/**
 * Crop rect params are normalized 0..1 rather than pixels — the preview runs at 1600px
 * and export at full size, so a pixel rect would crop two different regions.
 */
export const crop: ApplyFn = (_ctx, input, params) => {
  const x = Number(params.x);
  const y = Number(params.y);
  const w = Number(params.w);
  const h = Number(params.h);

  const px = Math.max(0, Math.round(x * input.width));
  const py = Math.max(0, Math.round(y * input.height));
  const pw = Math.max(1, Math.min(Math.round(w * input.width), input.width - px));
  const ph = Math.max(1, Math.min(Math.round(h * input.height), input.height - py));

  if (px === 0 && py === 0 && pw === input.width && ph === input.height) return input;

  const out = new ImageData(pw, ph);
  const src = input.data;
  const dst = out.data;
  for (let row = 0; row < ph; row++) {
    const from = ((py + row) * input.width + px) * 4;
    dst.set(src.subarray(from, from + pw * 4), row * pw * 4);
  }
  return out;
};
