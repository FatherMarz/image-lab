import { hexToRgb, luma } from "@/lib/color";
import type { ApplyFn } from "@/lib/ops/types";

/**
 * Gradient map: each pixel's luma picks a colour off a 2- or 3-stop ramp. With useMid off
 * it's a classic duotone; with it on it's a full gradient map (the riso/printmaking look).
 */
export const duotone: ApplyFn = (_ctx, input, params) => {
  const amount = Number(params.amount) / 100;
  if (amount <= 0) return input;

  const shadow = hexToRgb(String(params.shadow));
  const highlight = hexToRgb(String(params.highlight));
  const mid = hexToRgb(String(params.mid));
  const useMid = Boolean(params.useMid);

  // Precompute a 256-entry ramp so the pixel loop is a lookup, not a lerp per pixel.
  const ramp = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number;
    let g: number;
    let b: number;
    if (!useMid) {
      r = shadow.r + (highlight.r - shadow.r) * t;
      g = shadow.g + (highlight.g - shadow.g) * t;
      b = shadow.b + (highlight.b - shadow.b) * t;
    } else if (t < 0.5) {
      const u = t * 2;
      r = shadow.r + (mid.r - shadow.r) * u;
      g = shadow.g + (mid.g - shadow.g) * u;
      b = shadow.b + (mid.b - shadow.b) * u;
    } else {
      const u = (t - 0.5) * 2;
      r = mid.r + (highlight.r - mid.r) * u;
      g = mid.g + (highlight.g - mid.g) * u;
      b = mid.b + (highlight.b - mid.b) * u;
    }
    ramp[i * 3] = r;
    ramp[i * 3 + 1] = g;
    ramp[i * 3 + 2] = b;
  }

  const out = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = out.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const t = Math.round(luma(d[i], d[i + 1], d[i + 2]) * 255);
    const o = t * 3;
    d[i] += (ramp[o] - d[i]) * amount;
    d[i + 1] += (ramp[o + 1] - d[i + 1]) * amount;
    d[i + 2] += (ramp[o + 2] - d[i + 2]) * amount;
  }

  return out;
};
