import { labToSrgb, rgbToHex, srgbToLab } from "@/lib/color";

export type Swatch = { hex: string; share: number };

/** Deterministic RNG: same image gives the same palette every render, so swatches
 * don't reshuffle under the user while they're reading them. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const MAX_SAMPLES = 20000;
const ITERATIONS = 12;

/**
 * k-means in CIELAB. Clustering in RGB groups colours by numeric similarity rather
 * than by how they look, which yields muddy, unrepresentative palettes.
 */
export function extractPalette(img: ImageData, k: number): Swatch[] {
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const d = img.data;

  const samples: number[] = [];
  const px = new Float64Array(3);
  for (let i = 0; i < total; i += step) {
    const p = i * 4;
    if (d[p + 3] < 128) continue; // ignore cut-out areas
    srgbToLab(d[p], d[p + 1], d[p + 2], px);
    samples.push(px[0], px[1], px[2]);
  }

  const n = samples.length / 3;
  if (n === 0) return [];
  k = Math.min(k, n);

  // k-means++ seeding: spread the initial centroids out, otherwise near-duplicate
  // swatches are common.
  const rand = rng(0x5eed);
  const cent = new Float64Array(k * 3);
  const first = Math.floor(rand() * n) * 3;
  cent[0] = samples[first];
  cent[1] = samples[first + 1];
  cent[2] = samples[first + 2];

  const dist2 = new Float64Array(n);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < c; j++) {
        const dl = samples[i * 3] - cent[j * 3];
        const da = samples[i * 3 + 1] - cent[j * 3 + 1];
        const db = samples[i * 3 + 2] - cent[j * 3 + 2];
        const v = dl * dl + da * da + db * db;
        if (v < best) best = v;
      }
      dist2[i] = best;
      sum += best;
    }
    let target = rand() * sum;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      target -= dist2[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    cent[c * 3] = samples[pick * 3];
    cent[c * 3 + 1] = samples[pick * 3 + 1];
    cent[c * 3 + 2] = samples[pick * 3 + 2];
  }

  const assign = new Int32Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      let bestJ = 0;
      for (let j = 0; j < k; j++) {
        const dl = samples[i * 3] - cent[j * 3];
        const da = samples[i * 3 + 1] - cent[j * 3 + 1];
        const db = samples[i * 3 + 2] - cent[j * 3 + 2];
        const v = dl * dl + da * da + db * db;
        if (v < best) {
          best = v;
          bestJ = j;
        }
      }
      if (assign[i] !== bestJ) {
        assign[i] = bestJ;
        moved = true;
      }
    }
    if (!moved && iter > 0) break;

    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const j = assign[i];
      sums[j * 3] += samples[i * 3];
      sums[j * 3 + 1] += samples[i * 3 + 1];
      sums[j * 3 + 2] += samples[i * 3 + 2];
      counts[j]++;
    }
    for (let j = 0; j < k; j++) {
      if (!counts[j]) continue;
      cent[j * 3] = sums[j * 3] / counts[j];
      cent[j * 3 + 1] = sums[j * 3 + 1] / counts[j];
      cent[j * 3 + 2] = sums[j * 3 + 2] / counts[j];
    }
  }

  const rgb = new Float64Array(3);
  const out: Swatch[] = [];
  for (let j = 0; j < k; j++) {
    if (!counts[j]) continue;
    labToSrgb(cent[j * 3], cent[j * 3 + 1], cent[j * 3 + 2], rgb);
    out.push({ hex: rgbToHex(rgb[0], rgb[1], rgb[2]), share: counts[j] / n });
  }
  return out.sort((a, b) => b.share - a.share);
}
