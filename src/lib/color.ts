/**
 * Colour maths shared by the UI and the worker ops.
 *
 * Deliberately hand-rolled rather than using culori: these run per-pixel over millions
 * of pixels, and a library that allocates a colour object per call is far too slow
 * here. Everything below works on plain numbers.
 */

export type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return [Math.round((h / 6) * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** sRGB channel (0..255) to linear light (0..1). */
export function linearize(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0..1) back to an sRGB channel (0..255). */
export function delinearize(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;
// D65 white point
const WX = 0.95047;
const WY = 1.0;
const WZ = 1.08883;

function labF(t: number): number {
  return t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
}

/** sRGB (0..255) to CIELAB. Writes into `out` to stay allocation-free in pixel loops. */
export function srgbToLab(r: number, g: number, b: number, out: Float64Array): void {
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / WX;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) / WY;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / WZ;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
}

/** CIELAB back to sRGB (0..255). Writes into `out` to stay allocation-free. */
export function labToSrgb(l: number, a: number, b: number, out: Float64Array): void {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const fx3 = fx ** 3;
  const fz3 = fz ** 3;
  const x = (fx3 > LAB_E ? fx3 : (116 * fx - 16) / LAB_K) * WX;
  const y = (l > LAB_K * LAB_E ? ((l + 16) / 116) ** 3 : l / LAB_K) * WY;
  const z = (fz3 > LAB_E ? fz3 : (116 * fz - 16) / LAB_K) * WZ;

  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  out[0] = delinearize(rl);
  out[1] = delinearize(gl);
  out[2] = delinearize(bl);
}

/**
 * CIE76 difference. Not as accurate as CIEDE2000, but it's a plain euclidean distance
 * in a perceptual space — good enough to drive a tolerance slider, and cheap enough to
 * run per pixel. Anything in RGB space would make the slider behave unpredictably.
 */
export function deltaE76(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number,
): number {
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: RGB, bg: RGB): number {
  const la = relativeLuminance(a.r, a.g, a.b);
  const lb = relativeLuminance(bg.r, bg.g, bg.b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Perceived brightness 0..1, used to map luma onto a duotone ramp. */
export function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
