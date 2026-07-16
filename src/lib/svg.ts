/**
 * Rasterize traced SVG for display in the viewport.
 *
 * The tracer runs in the worker, but rasterizing its output needs an <img> to parse
 * the markup, and workers have no DOM — so this half has to live on the main thread.
 * drawImage is given explicit dimensions rather than trusting the SVG's intrinsic
 * size, which browsers disagree about when width/height carry units.
 */
export async function svgToBitmap(
  svg: string,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not rasterize traced SVG"));
      img.src = url;
    });

    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const cx = c.getContext("2d")!;
    cx.drawImage(img, 0, 0, width, height);
    return createImageBitmap(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}
