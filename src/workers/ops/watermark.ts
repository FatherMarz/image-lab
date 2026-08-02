import type { ApplyFn } from "@/lib/ops/types";

/**
 * Erase Gemini's sparkle watermark from the bottom-right corner.
 *
 * Detection is the hard part and it turns out to be unnecessary: Gemini stamps
 * the SAME four-point star, at the SAME proportional place, on every export
 * (measured across a batch: centre at 88.26% of each axis, width 4.98% of the
 * image). So the shape is baked in as a stencil rather than hunted for, which
 * is what earlier detection-based attempts kept getting wrong — the sparkle is
 * translucent, so it has no colour of its own to key on, and any threshold wide
 * enough to catch it also catches real artwork edges.
 *
 * With the stencil known, repair is three steps:
 *  1. eight-ray inpaint — every covered pixel is averaged from the nearest
 *     clean pixel along eight directions, weighted by 1/distance, which carries
 *     surrounding structure inward instead of smearing;
 *  2. edge rebuild — corner artwork is nearly always two flat colours meeting
 *     at one boundary. Where that is true, the boundary's position is fitted
 *     from clean scanlines above and below the hole and repainted straight
 *     through it, because step 1 alone bows the edge inward;
 *  3. a small median melt over the patch to regenerate anti-aliasing.
 *
 * All geometry is proportional to image size, so preview and export agree.
 */

// 102x102 bitmap of the sparkle, row-major, MSB first, base64 of the packed bits.
const STENCIL_W = 102;
const STENCIL_H = 102;
const STENCIL_B64 =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/4AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAP/8AAAAA" +
  "AAAAAAAAAP/8AAAAAAAAAAAAAAf/+AAAAAAAAAAAAAA///AAAAAAAAAAAAAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAB///gAA" +
  "AAAAAAAAAAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAD///wAAAAAAAAAAAAH///4AAAAAAAAAAAAH///4AAAAAAAAAAAAH///4" +
  "AAAAAAAAAAAB/////gAAAAAAAAAAD/////wAAAAAAAAAAH/////4AAAAAAAAAAP/////8AAAAAAAAAAf/////+AAAAAAAAAA////" +
  "///AAAAAAAAAB///////gAAAAAAAAB///////gAAAAAAAAB///////gAAAAAAAAD///////wAAAAAAAAH///////4AAAAAAAA///" +
  "//////AAAAAAAB/////////gAAAAAAD/////////wAAAAAAH/////////4AAAAAAP/////////8AAAAAAf/////////+AAAAAA//" +
  "/////////AAAAAA///////////AAAAAA///////////AAAAAA///////////AAAAAH///////////4AAAAP///////////8AAAH/" +
  "////////////4AAP/////////////8AAf/////////////+AH///////////////4P///////////////8P///////////////8P" +
  "///////////////8P///////////////8P///////////////8P///////////////8P///////////////8P///////////////" +
  "8P///////////////8P///////////////8P///////////////8P///////////////8H///////////////4Af////////////" +
  "/+AAP/////////////8AAH/////////////4AAAP///////////8AAAAH///////////4AAAAA///////////AAAAAA/////////" +
  "//AAAAAA///////////AAAAAA///////////AAAAAAf/////////+AAAAAAP/////////8AAAAAAH/////////4AAAAAAD//////" +
  "///wAAAAAAB/////////gAAAAAAA/////////AAAAAAAAH///////4AAAAAAAAD///////wAAAAAAAAB///////gAAAAAAAAB///" +
  "////gAAAAAAAAB///////gAAAAAAAAA///////AAAAAAAAAAf/////+AAAAAAAAAAP/////8AAAAAAAAAAH/////4AAAAAAAAAAD" +
  "/////wAAAAAAAAAAB/////gAAAAAAAAAAAH///4AAAAAAAAAAAAH///4AAAAAAAAAAAAH///4AAAAAAAAAAAAD///wAAAAAAAAAA" +
  "AAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAB///gAAAAAAAAAAAAA///AAAAAAAAA" +
  "AAAAAf/+AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAP/8AAAAAAAAAAAAAAH/4AAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const CENTRE = 0.882568; // stamp centre, fraction of each axis
const SPAN = 0.056; // stamp width, fraction of the shorter axis (measured 0.0498, padded)

let stencilCache: Uint8Array | null = null;

function stencil(): Uint8Array {
  if (stencilCache) return stencilCache;
  const bin = atob(STENCIL_B64);
  const out = new Uint8Array(STENCIL_W * STENCIL_H);
  for (let i = 0; i < out.length; i++) {
    out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  }
  stencilCache = out;
  return out;
}

/** Sliding-histogram median per channel, radius r, on a small RGBA buffer. */
function medianSmooth(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const hist = new Uint32Array(256);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      hist.fill(0);
      let count = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = 0; xx <= Math.min(w - 1, r); xx++) {
          hist[src[(yy * w + xx) * 4 + c]]++;
          count++;
        }
      }
      for (let x = 0; x < w; x++) {
        if (x > 0) {
          const add = x + r;
          const del = x - r - 1;
          for (let yy = y0; yy <= y1; yy++) {
            if (add < w) {
              hist[src[(yy * w + add) * 4 + c]]++;
              count++;
            }
            if (del >= 0) {
              hist[src[(yy * w + del) * 4 + c]]--;
              count--;
            }
          }
        }
        const target = count >> 1;
        let acc = 0;
        for (let v = 0; v < 256; v++) {
          acc += hist[v];
          if (acc > target) {
            out[(y * w + x) * 4 + c] = v;
            break;
          }
        }
      }
    }
  }
  return out;
}

export const watermark: ApplyFn = (_ctx, input, params) => {
  const strength = Math.max(0, Math.min(100, Number(params.strength ?? 100)));
  const { width: w, height: h } = input;
  const out = new ImageData(new Uint8ClampedArray(input.data), w, h);
  if (strength === 0) return out;
  const d = out.data;

  const short = Math.min(w, h);
  const span = Math.max(8, Math.round(short * SPAN));
  // Work box: the stamp plus a margin the repair can read clean pixels from.
  const pad = Math.max(8, Math.round(span * 0.6));
  const cx = Math.round(w * CENTRE);
  const cy = Math.round(h * CENTRE);
  const x0 = Math.max(0, cx - ((span / 2) | 0) - pad);
  const y0 = Math.max(0, cy - ((span / 2) | 0) - pad);
  const x1 = Math.min(w, cx + ((span / 2) | 0) + pad + 1);
  const y1 = Math.min(h, cy + ((span / 2) | 0) + pad + 1);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 12 || rh < 12) return out;

  const region = new Uint8ClampedArray(rw * rh * 4);
  for (let yy = 0; yy < rh; yy++) {
    region.set(d.subarray(((y0 + yy) * w + x0) * 4, ((y0 + yy) * w + x0 + rw) * 4), yy * rw * 4);
  }

  // Sample the stencil at the working scale, for a candidate centre offset.
  const st = stencil();
  const maskAt = (ox: number, oy: number, scale = 1): Uint8Array => {
    const m = new Uint8Array(rw * rh);
    const sp = span * scale;
    const half = sp / 2;
    const mcx = cx - x0 + ox;
    const mcy = cy - y0 + oy;
    const lo = Math.ceil(-half);
    const hi = Math.floor(half);
    for (let dy = lo; dy <= hi; dy++) {
      const py = mcy + dy;
      if (py < 0 || py >= rh) continue;
      const sy = Math.min(STENCIL_H - 1, Math.max(0, Math.round(((dy + half) / sp) * (STENCIL_H - 1))));
      for (let dx = lo; dx <= hi; dx++) {
        const px = mcx + dx;
        if (px < 0 || px >= rw) continue;
        const sx = Math.min(STENCIL_W - 1, Math.max(0, Math.round(((dx + half) / sp) * (STENCIL_W - 1))));
        if (st[sy * STENCIL_W + sx]) m[py * rw + px] = 1;
      }
    }
    return m;
  };

  // No search for the stamp: its position is fixed and known. Every attempt to
  // locate it by brightness slid the stencil onto whatever high-contrast
  // boundary was nearby — a jacket edge against a light background scores far
  // higher than the sparkle itself ever does. The stencil is cut oversize
  // instead, which absorbs the small variation that does exist.
  const mask = maskAt(0, 0);
  // Grow by a couple of pixels to swallow the stamp's anti-aliased rim.
  const grow = Math.max(2, Math.round(span * 0.06));
  for (let g = 0; g < grow; g++) {
    const next = mask.slice();
    for (let yy = 1; yy < rh - 1; yy++) {
      for (let xx = 1; xx < rw - 1; xx++) {
        const p = yy * rw + xx;
        if (mask[p]) continue;
        if (mask[p - 1] || mask[p + 1] || mask[p - rw] || mask[p + rw]) next[p] = 1;
      }
    }
    mask.set(next);
  }

  const original = region.slice();

  // 1. Eight-ray inpaint.
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const filled = region.slice();
  for (let yy = 0; yy < rh; yy++) {
    for (let xx = 0; xx < rw; xx++) {
      const p = yy * rw + xx;
      if (!mask[p]) continue;
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wsum = 0;
      for (const [dx, dy] of DIRS) {
        let sx = xx + dx;
        let sy = yy + dy;
        let dist = 1;
        while (sx >= 0 && sy >= 0 && sx < rw && sy < rh && mask[sy * rw + sx]) {
          sx += dx;
          sy += dy;
          dist++;
        }
        if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) continue;
        const q = (sy * rw + sx) * 4;
        const weight = 1 / (dist * dist);
        wr += region[q] * weight;
        wg += region[q + 1] * weight;
        wb += region[q + 2] * weight;
        wsum += weight;
      }
      if (wsum > 0) {
        const i = p * 4;
        filled[i] = wr / wsum;
        filled[i + 1] = wg / wsum;
        filled[i + 2] = wb / wsum;
      }
    }
  }
  region.set(filled);

  // 2. Edge rebuild, when the ring around the hole is two flat colours.
  const ring: number[] = [];
  for (let yy = 1; yy < rh - 1; yy++) {
    for (let xx = 1; xx < rw - 1; xx++) {
      const p = yy * rw + xx;
      if (mask[p]) continue;
      if (mask[p - 1] || mask[p + 1] || mask[p - rw] || mask[p + rw]) ring.push(p);
    }
  }
  const lumOf = (p: number) => original[p * 4] + original[p * 4 + 1] + original[p * 4 + 2];
  if (ring.length > 20) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of ring) {
      const v = lumOf(p);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const mid = (lo + hi) / 2;
    let nLo = 0;
    let nHi = 0;
    const cLo = [0, 0, 0];
    const cHi = [0, 0, 0];
    for (const p of ring) {
      const tgt = lumOf(p) < mid ? cLo : cHi;
      for (let c = 0; c < 3; c++) tgt[c] += original[p * 4 + c];
      if (lumOf(p) < mid) nLo++;
      else nHi++;
    }
    if (hi - lo > 60 && nLo > 8 && nHi > 8) {
      for (let c = 0; c < 3; c++) {
        cLo[c] /= nLo;
        cHi[c] /= nHi;
      }
      // Rows the hole spans, and the clean rows around it used for the fit.
      let my0 = rh;
      let my1 = 0;
      let mx0 = rw;
      let mx1 = 0;
      for (let yy = 0; yy < rh; yy++) {
        for (let xx = 0; xx < rw; xx++) {
          if (mask[yy * rw + xx]) {
            if (yy < my0) my0 = yy;
            if (yy > my1) my1 = yy;
            if (xx < mx0) mx0 = xx;
            if (xx > mx1) mx1 = xx;
          }
        }
      }
      const isLo = (p: number) => lumOf(p) < mid;
      const rowHasMask = (yy: number) => {
        for (let xx = 0; xx < rw; xx++) if (mask[yy * rw + xx]) return true;
        return false;
      };
      // Fit edge x as a quadratic in y from clean scanlines.
      const fy: number[] = [];
      const fx: number[] = [];
      for (let yy = 0; yy < rh; yy++) {
        if (rowHasMask(yy)) continue;
        let last = -1;
        let any = false;
        for (let xx = 0; xx < rw; xx++) {
          if (isLo(yy * rw + xx)) {
            last = xx;
            any = true;
          }
        }
        if (any && last < rw - 1) {
          fy.push(yy);
          fx.push(last);
        }
      }
      if (fy.length >= 6) {
        // Least squares for x = a*y^2 + b*y + c.
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        let s3 = 0;
        let s4 = 0;
        let t0 = 0;
        let t1 = 0;
        let t2 = 0;
        for (let i = 0; i < fy.length; i++) {
          const y = fy[i];
          const x = fx[i];
          const y2 = y * y;
          s0 += 1;
          s1 += y;
          s2 += y2;
          s3 += y2 * y;
          s4 += y2 * y2;
          t0 += x;
          t1 += x * y;
          t2 += x * y2;
        }
        const m3 = [
          [s4, s3, s2],
          [s3, s2, s1],
          [s2, s1, s0],
        ];
        const v3 = [t2, t1, t0];
        // Gaussian elimination, 3x3.
        for (let i = 0; i < 3; i++) {
          let piv = i;
          for (let r = i + 1; r < 3; r++) if (Math.abs(m3[r][i]) > Math.abs(m3[piv][i])) piv = r;
          if (Math.abs(m3[piv][i]) < 1e-9) {
            v3[0] = NaN;
            break;
          }
          [m3[i], m3[piv]] = [m3[piv], m3[i]];
          [v3[i], v3[piv]] = [v3[piv], v3[i]];
          for (let r = i + 1; r < 3; r++) {
            const f = m3[r][i] / m3[i][i];
            for (let c = i; c < 3; c++) m3[r][c] -= f * m3[i][c];
            v3[r] -= f * v3[i];
          }
        }
        if (!Number.isNaN(v3[0])) {
          const coef = [0, 0, 0];
          for (let i = 2; i >= 0; i--) {
            let acc = v3[i];
            for (let c = i + 1; c < 3; c++) acc -= m3[i][c] * coef[c];
            coef[i] = acc / m3[i][i];
          }
          for (let yy = my0; yy <= my1; yy++) {
            const ex = coef[0] * yy * yy + coef[1] * yy + coef[2];
            if (!Number.isFinite(ex) || ex < mx0 - rw || ex > mx1 + rw) continue;
            for (let xx = 0; xx < rw; xx++) {
              const p = yy * rw + xx;
              if (!mask[p]) continue;
              const t = Math.max(0, Math.min(1, (xx - ex + 1.5) / 3));
              const i = p * 4;
              region[i] = cLo[0] * (1 - t) + cHi[0] * t;
              region[i + 1] = cLo[1] * (1 - t) + cHi[1] * t;
              region[i + 2] = cLo[2] * (1 - t) + cHi[2] * t;
            }
          }
        }
      }
    }
  }

  // 3. Melt: a small median over the patch to regenerate anti-aliasing.
  const meltR = Math.max(1, Math.round(span * 0.025));
  const melted = medianSmooth(region, rw, rh, meltR);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    region[i] = melted[i];
    region[i + 1] = melted[i + 1];
    region[i + 2] = melted[i + 2];
  }

  // Strength blends the repair back toward the original, for the rare case
  // where a partial fade reads better than a full erase.
  const a = strength / 100;
  for (let yy = 0; yy < rh; yy++) {
    for (let xx = 0; xx < rw; xx++) {
      const p = yy * rw + xx;
      if (!mask[p]) continue;
      const s = p * 4;
      const i = ((y0 + yy) * w + (x0 + xx)) * 4;
      d[i] = original[s] * (1 - a) + region[s] * a;
      d[i + 1] = original[s + 1] * (1 - a) + region[s + 1] * a;
      d[i + 2] = original[s + 2] * (1 - a) + region[s + 2] * a;
    }
  }

  return out;
};
