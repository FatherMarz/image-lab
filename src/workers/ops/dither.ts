import type { ApplyFn } from "@/lib/ops/types";

/** Atkinson spreads only 6/8 of the error, which is why it looks lighter and crisper
 * than Floyd–Steinberg — the classic early-Mac look. */
const KERNELS: Record<string, { dx: number; dy: number; w: number }[]> = {
  floyd: [
    { dx: 1, dy: 0, w: 7 / 16 },
    { dx: -1, dy: 1, w: 3 / 16 },
    { dx: 0, dy: 1, w: 5 / 16 },
    { dx: 1, dy: 1, w: 1 / 16 },
  ],
  atkinson: [
    { dx: 1, dy: 0, w: 1 / 8 },
    { dx: 2, dy: 0, w: 1 / 8 },
    { dx: -1, dy: 1, w: 1 / 8 },
    { dx: 0, dy: 1, w: 1 / 8 },
    { dx: 1, dy: 1, w: 1 / 8 },
    { dx: 0, dy: 2, w: 1 / 8 },
  ],
};

export const dither: ApplyFn = (_ctx, input, params) => {
  const kernel = KERNELS[String(params.algorithm)] ?? KERNELS.floyd;
  const levels = Math.max(2, Number(params.levels));
  const mono = Boolean(params.mono);

  const { width: w, height: h } = input;
  const out = new ImageData(new Uint8ClampedArray(input.data), w, h);
  const d = out.data;

  // Error diffusion needs float headroom; accumulating in the clamped byte array
  // would clip the error and band the result.
  const buf = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 3) {
    if (mono) {
      const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      buf[p] = buf[p + 1] = buf[p + 2] = g;
    } else {
      buf[p] = d[i];
      buf[p + 1] = d[i + 1];
      buf[p + 2] = d[i + 2];
    }
  }

  const step = 255 / (levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const old = buf[p + c];
        const next = Math.round(old / step) * step;
        buf[p + c] = next;
        const err = old - next;
        for (const k of kernel) {
          const nx = x + k.dx;
          const ny = y + k.dy;
          if (nx < 0 || nx >= w || ny >= h) continue;
          buf[(ny * w + nx) * 3 + c] += err * k.w;
        }
      }
    }
  }

  for (let i = 0, p = 0; i < d.length; i += 4, p += 3) {
    d[i] = buf[p];
    d[i + 1] = buf[p + 1];
    d[i + 2] = buf[p + 2];
  }
  return out;
};
