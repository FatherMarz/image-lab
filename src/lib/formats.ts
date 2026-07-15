import type { ExportFormat } from "./protocol";

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "image/avif": "AVIF",
};

export const FORMAT_EXT: Record<ExportFormat, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Formats where the quality slider does anything. PNG is lossless. */
export const LOSSY: ExportFormat[] = ["image/jpeg", "image/webp", "image/avif"];

/** Alpha-capable. Exporting a cutout as JPG flattens it onto white. */
export const HAS_ALPHA: ExportFormat[] = ["image/png", "image/webp", "image/avif"];

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
  return supported.length ? supported : ["image/png"];
}
