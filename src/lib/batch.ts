import { zipSync } from "fflate";
import { FORMAT_EXT } from "./formats";
import type { Op } from "./ops/types";
import { PipelineClient } from "./pipeline";
import type { ExportFormat } from "./protocol";

/**
 * Runs the current stack over many files and zips the results.
 *
 * Uses its own worker rather than the app's: the pipeline holds one source image, so
 * batching through the main client would clobber whatever the user is editing. The
 * model weights come from the shared browser cache, so the extra worker doesn't
 * re-download anything.
 *
 * Sequential on purpose — these are large ImageData buffers and, with a segmentation
 * model in the stack, parallel runs would fight over GPU memory for no wall-clock win.
 */
export async function runBatch(
  files: File[],
  ops: Op[],
  format: ExportFormat,
  quality: number,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<{ zip: Blob; failed: string[] }> {
  const client = new PipelineClient();
  const out: Record<string, Uint8Array> = {};
  const failed: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i, files.length, file.name);
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        await client.load(bitmap);
        const res = await client.exportImage(ops, format, quality);
        const stem = file.name.replace(/\.[^.]+$/, "");
        out[`${stem}.${FORMAT_EXT[format]}`] = new Uint8Array(await res.blob.arrayBuffer());
      } catch {
        // One bad file shouldn't sink the whole batch — record it and carry on.
        failed.push(file.name);
      }
      onProgress?.(i + 1, files.length, file.name);
    }
  } finally {
    client.dispose();
  }

  return {
    zip: new Blob([zipSync(out, { level: 6 })], { type: "application/zip" }),
    failed,
  };
}
