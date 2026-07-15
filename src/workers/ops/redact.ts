import type { ApplyFn } from "@/lib/ops/types";

type Region = { x: number; y: number; w: number; h: number };

/**
 * Regions are a JSON string of normalized 0..1 rects. Params are flat scalars by
 * design, and geometry must be normalized so the preview and the full-size export
 * redact the same area — a pixel rect would redact the wrong region on export, which
 * for a redaction tool means leaking exactly what you meant to hide.
 */
function parseRegions(raw: unknown): Region[] {
  try {
    const v = JSON.parse(String(raw || "[]"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const redact: ApplyFn = (_ctx, input, params) => {
  const regions = parseRegions(params.regions);
  if (regions.length === 0) return input;

  const mode = String(params.mode);
  const strength = Math.max(1, Number(params.strength));
  const { width: w, height: h } = input;

  const out = new ImageData(new Uint8ClampedArray(input.data), w, h);
  const d = out.data;

  for (const r of regions) {
    const x0 = Math.max(0, Math.round(r.x * w));
    const y0 = Math.max(0, Math.round(r.y * h));
    const x1 = Math.min(w, Math.round((r.x + r.w) * w));
    const y1 = Math.min(h, Math.round((r.y + r.h) * h));
    if (x1 <= x0 || y1 <= y0) continue;

    if (mode === "fill") {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          d[i] = 20;
          d[i + 1] = 22;
          d[i + 2] = 18;
        }
      }
      continue;
    }

    // Pixelate: average each block and write it back flat. Unlike a blur, this is
    // not reversible by sharpening, which is the point for redaction.
    const block = Math.max(2, Math.round((strength / 100) * Math.min(x1 - x0, y1 - y0)));
    for (let by = y0; by < y1; by += block) {
      for (let bx = x0; bx < x1; bx += block) {
        const ex = Math.min(bx + block, x1);
        const ey = Math.min(by + block, y1);
        let r0 = 0;
        let g0 = 0;
        let b0 = 0;
        let n = 0;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            r0 += d[i];
            g0 += d[i + 1];
            b0 += d[i + 2];
            n++;
          }
        }
        r0 /= n;
        g0 /= n;
        b0 /= n;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            d[i] = r0;
            d[i + 1] = g0;
            d[i + 2] = b0;
          }
        }
      }
    }
  }

  return out;
};
