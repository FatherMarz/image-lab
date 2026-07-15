import type { OpMeta } from "./types";

/**
 * Op metadata shared by the UI (renders controls) and the worker (looks up defaults).
 * The matching apply() functions live in src/workers/ops — they never reach the main
 * thread, so the model weights and pixel loops stay off it.
 */
export const OP_META: Record<string, OpMeta> = {
  adjust: {
    type: "adjust",
    label: "Adjust",
    group: "transform",
    blurb: "Brightness, contrast, saturation.",
    defaults: { brightness: 0, contrast: 0, saturation: 0 },
    controls: [
      { kind: "slider", key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
      { kind: "slider", key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
      { kind: "slider", key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
    ],
  },
};

export const OP_ORDER: string[] = ["adjust"];

export function metaFor(type: string): OpMeta {
  const meta = OP_META[type];
  if (!meta) throw new Error(`Unknown op type: ${type}`);
  return meta;
}
