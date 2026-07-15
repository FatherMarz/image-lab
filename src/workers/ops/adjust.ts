import type { ApplyFn } from "@/lib/ops/types";

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export const adjust: ApplyFn = (_ctx, input, params) => {
  const brightness = Number(params.brightness) || 0;
  const contrast = Number(params.contrast) || 0;
  const saturation = Number(params.saturation) || 0;

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
