import { deltaE76, hexToRgb, labToSrgb, srgbToLab } from "@/lib/color";
import type { ApplyFn } from "@/lib/ops/types";

const TOL_RANGE = 60;
const SOFT_RANGE = 30;

/**
 * Recolour by shifting matched pixels through CIELAB by the from->to delta, rather
 * than painting them a flat colour. Shading, texture and highlights survive, which is
 * the difference between recolouring a shirt and stamping a hole in it.
 *
 * With preserveLuma on, only the a/b (chroma) axes shift and lightness is untouched —
 * that keeps a light colour light when swapped to a dark hue.
 */
export const colorSwap: ApplyFn = (_ctx, input, params) => {
  const from = hexToRgb(String(params.from));
  const to = hexToRgb(String(params.to));
  const tol = (Number(params.tolerance) / 100) * TOL_RANGE;
  const soft = (Number(params.softness) / 100) * SOFT_RANGE;
  const preserveLuma = Boolean(params.preserveLuma);

  const fLab = new Float64Array(3);
  const tLab = new Float64Array(3);
  srgbToLab(from.r, from.g, from.b, fLab);
  srgbToLab(to.r, to.g, to.b, tLab);

  const dL = tLab[0] - fLab[0];
  const dA = tLab[1] - fLab[1];
  const dB = tLab[2] - fLab[2];

  const out = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = out.data;
  const px = new Float64Array(3);
  const rgb = new Float64Array(3);

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;

    srgbToLab(d[i], d[i + 1], d[i + 2], px);
    const dist = deltaE76(px[0], px[1], px[2], fLab[0], fLab[1], fLab[2]);

    let w: number;
    if (dist <= tol) w = 1;
    else if (dist >= tol + soft) w = 0;
    else w = 1 - (dist - tol) / soft;
    if (w === 0) continue;

    labToSrgb(
      px[0] + (preserveLuma ? 0 : dL * w),
      px[1] + dA * w,
      px[2] + dB * w,
      rgb,
    );
    d[i] = rgb[0];
    d[i + 1] = rgb[1];
    d[i + 2] = rgb[2];
  }

  return out;
};
