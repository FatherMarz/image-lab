import { deltaE76, hexToRgb, luma, srgbToLab } from "@/lib/color";
import type { ApplyFn } from "@/lib/ops/types";

/** deltaE range a tolerance slider maps onto. ~60 covers "same colour" to "unrelated". */
const TOL_RANGE = 60;
const SOFT_RANGE = 30;

/**
 * Chroma key. Matching is done by perceptual distance in CIELAB rather than RGB
 * distance, so the tolerance slider behaves consistently across hues instead of
 * being wildly over-sensitive in green and under-sensitive in blue.
 */
export const colorDelete: ApplyFn = (_ctx, input, params) => {
  const target = hexToRgb(String(params.color));
  const tol = (Number(params.tolerance) / 100) * TOL_RANGE;
  const soft = (Number(params.softness) / 100) * SOFT_RANGE;
  const despill = Boolean(params.despill);

  const tLab = new Float64Array(3);
  srgbToLab(target.r, target.g, target.b, tLab);

  const out = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = out.data;
  const px = new Float64Array(3);

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;

    srgbToLab(d[i], d[i + 1], d[i + 2], px);
    const dist = deltaE76(px[0], px[1], px[2], tLab[0], tLab[1], tLab[2]);

    let a: number;
    if (dist <= tol) a = 0;
    else if (dist >= tol + soft) a = 1;
    else a = (dist - tol) / soft;

    if (a < 1 && despill) {
      // Edge pixels blended with the key colour keep a cast of it. Pull them toward
      // their own luma in proportion to how keyed they are, which kills the fringe.
      const L = luma(d[i], d[i + 1], d[i + 2]) * 255;
      const k = 1 - a;
      d[i] += (L - d[i]) * k;
      d[i + 1] += (L - d[i + 1]) * k;
      d[i + 2] += (L - d[i + 2]) * k;
    }

    d[i + 3] *= a;
  }

  return out;
};
