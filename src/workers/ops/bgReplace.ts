import type { ApplyFn } from "@/lib/ops/types";
import { getAsset } from "../assets";

export const bgReplace: ApplyFn = (_ctx, input, params) => {
  const mode = String(params.mode);
  if (mode === "none") return input;

  const w = input.width;
  const h = input.height;
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
  } else if (mode === "image") {
    const asset = getAsset(String(params.assetId));
    if (asset) {
      // Cover-fit: fill the frame, centre-crop the overflow.
      const s = Math.max(w / asset.width, h / asset.height);
      const dw = asset.width * s;
      const dh = asset.height * s;
      cx.drawImage(asset, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
  }

  // Let canvas do the alpha compositing rather than hand-rolling the blend.
  const subject = new OffscreenCanvas(w, h);
  subject.getContext("2d")!.putImageData(input, 0, 0);
  cx.drawImage(subject, 0, 0);

  return cx.getImageData(0, 0, w, h);
};
