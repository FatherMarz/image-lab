import type { ApplyFn } from "@/lib/ops/types";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Sticker outline + drop shadow, drawn into the subject's own alpha layer so a
 * later bg-replace composites its backdrop behind the shadow rather than over it.
 */
export const cutoutStyle: ApplyFn = (ctx, input, params) => {
  const outline = Number(params.outline);
  const outlineColor = String(params.outlineColor);
  const shadowBlur = Number(params.shadowBlur);
  const shadowX = Number(params.shadowX);
  const shadowY = Number(params.shadowY);
  const shadowOpacity = Number(params.shadowOpacity);
  const shadowColor = String(params.shadowColor);

  if (outline <= 0 && shadowOpacity <= 0) return input;

  const w = input.width;
  const h = input.height;

  const subject = new OffscreenCanvas(w, h);
  subject.getContext("2d")!.putImageData(input, 0, 0);

  /** Subject alpha filled with a flat colour. */
  function silhouette(color: string) {
    const s = new OffscreenCanvas(w, h);
    const sx = s.getContext("2d")!;
    sx.drawImage(subject, 0, 0);
    sx.globalCompositeOperation = "source-in";
    sx.fillStyle = color;
    sx.fillRect(0, 0, w, h);
    return s;
  }

  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;

  if (shadowOpacity > 0) {
    // canvas 2d `filter` isn't reliable across browsers, but shadowBlur is. Draw the
    // silhouette far off-canvas and push its shadow back by the same distance, so
    // only the shadow lands in frame.
    const sil = silhouette("#000000");
    cx.save();
    cx.shadowColor = hexToRgba(shadowColor, shadowOpacity / 100);
    cx.shadowBlur = shadowBlur * ctx.scale;
    cx.shadowOffsetX = shadowX * ctx.scale + w * 2;
    cx.shadowOffsetY = shadowY * ctx.scale;
    cx.drawImage(sil, -w * 2, 0);
    cx.restore();
  }

  if (outline > 0) {
    // Dilate by stamping the silhouette around a ring. Subjects touching the frame
    // edge get their outline clipped — there's no margin to draw into.
    const sil = silhouette(outlineColor);
    const r = Math.max(1, outline * ctx.scale);
    const steps = Math.max(16, Math.ceil(r * 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      cx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  cx.drawImage(subject, 0, 0);
  return cx.getImageData(0, 0, w, h);
};
