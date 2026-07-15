import type { ApplyFn } from "@/lib/ops/types";

/** Rotate in 90° steps and flip. Canvas transforms handle the pixel shuffling. */
export const orient: ApplyFn = (_ctx, input, params) => {
  const angle = ((Number(params.angle) % 360) + 360) % 360;
  const flipH = Boolean(params.flipH);
  const flipV = Boolean(params.flipV);
  if (!angle && !flipH && !flipV) return input;

  const swap = angle === 90 || angle === 270;
  const w = swap ? input.height : input.width;
  const h = swap ? input.width : input.height;

  const src = new OffscreenCanvas(input.width, input.height);
  src.getContext("2d")!.putImageData(input, 0, 0);

  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;
  cx.translate(w / 2, h / 2);
  cx.rotate((angle * Math.PI) / 180);
  cx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  cx.drawImage(src, -input.width / 2, -input.height / 2);

  return cx.getImageData(0, 0, w, h);
};
