import type { ApplyFn } from "@/lib/ops/types";

/**
 * Screenshot polish: padding, backdrop, rounded corners, drop shadow. Grows the
 * canvas, so every measurement is a fraction of the image rather than a pixel count —
 * otherwise the preview and the full-size export would frame differently.
 */
export const frame: ApplyFn = (ctx, input, params) => {
  const pad = Number(params.padding) / 100;
  const radius = Number(params.radius) / 100;
  const shadowOpacity = Number(params.shadowOpacity);
  const shadowBlur = Number(params.shadowBlur);
  const mode = String(params.mode);

  if (pad <= 0 && radius <= 0 && shadowOpacity <= 0) return input;

  const inset = Math.round(Math.min(input.width, input.height) * pad);
  const w = input.width + inset * 2;
  const h = input.height + inset * 2;

  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;

  if (mode === "color") {
    cx.fillStyle = String(params.color);
    cx.fillRect(0, 0, w, h);
  } else if (mode === "gradient") {
    const angle = (Number(params.angle) * Math.PI) / 180;
    const dx = (Math.cos(angle) * w) / 2;
    const dy = (Math.sin(angle) * h) / 2;
    const g = cx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    g.addColorStop(0, String(params.color));
    g.addColorStop(1, String(params.color2));
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);
  }

  const src = new OffscreenCanvas(input.width, input.height);
  src.getContext("2d")!.putImageData(input, 0, 0);

  const r = Math.round(Math.min(input.width, input.height) * radius * 0.5);

  if (shadowOpacity > 0) {
    cx.save();
    cx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity / 100})`;
    cx.shadowBlur = shadowBlur * ctx.scale;
    cx.shadowOffsetY = shadowBlur * 0.35 * ctx.scale;
    cx.fillStyle = "#000";
    // Fill the rounded silhouette to cast the shadow; the image lands on top of it.
    cx.beginPath();
    cx.roundRect(inset, inset, input.width, input.height, r);
    cx.fill();
    cx.restore();
  }

  cx.save();
  cx.beginPath();
  cx.roundRect(inset, inset, input.width, input.height, r);
  cx.clip();
  cx.drawImage(src, inset, inset);
  cx.restore();

  return cx.getImageData(0, 0, w, h);
};
