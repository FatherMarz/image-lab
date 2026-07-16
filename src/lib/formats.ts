import type { ExportFormat } from "./protocol";

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
  "image/svg+xml": "SVG",
};

export const FORMAT_EXT: Record<ExportFormat, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** Formats where the quality slider does anything. PNG is lossless; SVG has no
 * encoder at all — its settings belong to the Vectorize tool. */
export const LOSSY: ExportFormat[] = ["image/jpeg", "image/webp", "image/avif"];

/** Alpha-capable. Exporting a cutout as JPG flattens it onto white. */
export const HAS_ALPHA: ExportFormat[] = [
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
];

/** Vector output: no canvas codec, and size estimation by pixel ratio is meaningless. */
export const VECTOR: ExportFormat[] = ["image/svg+xml"];

const ALL: ExportFormat[] = ["image/png", "image/jpeg", "image/webp", "image/avif"];

/**
 * Canvas silently falls back to PNG when asked for a codec it can't encode, so we
 * probe by comparing the returned blob's type rather than trusting the request.
 * AVIF in particular is not encodable in every browser.
 */
export async function detectFormats(): Promise<ExportFormat[]> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const supported: ExportFormat[] = [];
  for (const format of ALL) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, format, 0.9));
    if (blob && blob.type === format) supported.push(format);
  }
  // SVG isn't a canvas codec — we trace it ourselves, so it's always available.
  supported.push("image/svg+xml");
  return supported;
}
