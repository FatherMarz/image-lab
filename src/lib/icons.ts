import { zipSync } from "fflate";
import type { Op } from "./ops/types";
import { pipeline } from "./pipeline";

/** The set you actually need to ship a web app, and what each one is for. */
export const ICON_SIZES = [
  { size: 16, name: "favicon-16.png" },
  { size: 32, name: "favicon-32.png" },
  { size: 48, name: "favicon-48.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

function manifest(name: string) {
  return JSON.stringify(
    {
      name,
      short_name: name,
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      display: "standalone",
    },
    null,
    2,
  );
}

/**
 * Renders the current stack at each icon size by appending a pixel-mode resize op —
 * no separate code path, so icons get the same cutout/colour work as the preview.
 * Pixel-mode resize multiplies by ctx.scale, and export runs at scale 1, so the
 * numbers land exactly.
 */
export async function buildIconSet(
  ops: Op[],
  name: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};

  for (let i = 0; i < ICON_SIZES.length; i++) {
    const { size, name: file } = ICON_SIZES[i];
    const sized: Op[] = [
      ...ops,
      {
        id: `__icon-${size}`,
        type: "resize",
        enabled: true,
        params: { mode: "pixels", width: size, height: size, lockAspect: false },
      },
    ];
    const res = await pipeline.exportImage(sized, "image/png", 1);
    files[file] = new Uint8Array(await res.blob.arrayBuffer());
    onProgress?.(i + 1, ICON_SIZES.length);
  }

  files["manifest.json"] = new TextEncoder().encode(manifest(name));
  return new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
}
