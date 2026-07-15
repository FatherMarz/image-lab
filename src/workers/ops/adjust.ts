import type { ApplyFn } from "@/lib/ops/types";

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * Unsharp mask via a 3x3 convolution. Runs before the tonal maths so it sharpens the
 * actual detail rather than amplifying a boosted-contrast edge.
 */
function sharpen(img: ImageData, amount: number): ImageData {
  const { width: w, height: h, data: src } = img;
  const out = new ImageData(new Uint8ClampedArray(src), w, h);
  const d = out.data;
  const k = amount / 100;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        const centre = src[p];
        const neighbours =
          src[p - 4] + src[p + 4] + src[p - w * 4] + src[p + w * 4];
        // centre*5 - neighbours is the standard sharpen kernel; lerp toward it by k.
        d[p] = centre + (centre * 5 - neighbours - centre) * k;
      }
    }
  }
  return out;
}

export const adjust: ApplyFn = (ctx, input, params) => {
  const brightness = Number(params.brightness) || 0;
  const contrast = Number(params.contrast) || 0;
  const saturation = Number(params.saturation) || 0;
  const sharpness = Number(params.sharpen) || 0;

  if (sharpness > 0) {
    // Sharpen radius is a fixed 1px kernel, so preview and export differ slightly by
    // design — matching exactly would mean scaling the kernel, which at preview
    // resolution would just blur.
    input = sharpen(input, sharpness * ctx.scale);
  }

  const out = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = out.data;

  const bAdd = brightness * 2.55;
  const c = contrast * 2.55;
  // Standard contrast factor: pivots around mid-grey without clipping the curve.
  const cFactor = (259 * (c + 255)) / (255 * (259 - c));
  const sMul = 1 + saturation / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (brightness !== 0) {
      r += bAdd;
      g += bAdd;
      b += bAdd;
    }
    if (contrast !== 0) {
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;
    }
    if (saturation !== 0) {
      const grey = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = grey + (r - grey) * sMul;
      g = grey + (g - grey) * sMul;
      b = grey + (b - grey) * sMul;
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    // alpha untouched
  }

  return out;
};
