import type { OpMeta } from "./types";

/**
 * Op metadata shared by the UI (renders controls) and the worker (looks up defaults).
 * The matching apply() functions live in src/workers/ops — they never reach the main
 * thread, so the model weights and pixel loops stay off it.
 */
export const OP_META: Record<string, OpMeta> = {
  "bg-remove": {
    type: "bg-remove",
    label: "Remove BG",
    group: "bg",
    blurb: "Cut the subject out. First use downloads the model.",
    defaults: { model: "general", threshold: 50, feather: 0 },
    controls: [
      {
        kind: "select",
        key: "model",
        label: "Subject",
        options: [
          { value: "general", label: "Anything" },
          { value: "people", label: "People" },
        ],
      },
      { kind: "slider", key: "threshold", label: "Threshold", min: 0, max: 100, step: 1 },
      { kind: "slider", key: "feather", label: "Feather", min: 0, max: 8, step: 1, unit: "px" },
    ],
  },

  "cutout-style": {
    type: "cutout-style",
    label: "Outline + Shadow",
    group: "bg",
    blurb: "Sticker outline and drop shadow around the cutout.",
    defaults: {
      outline: 0,
      outlineColor: "#ffffff",
      shadowBlur: 12,
      shadowX: 0,
      shadowY: 8,
      shadowOpacity: 0,
      shadowColor: "#000000",
    },
    controls: [
      { kind: "slider", key: "outline", label: "Outline", min: 0, max: 20, step: 1, unit: "px" },
      { kind: "color", key: "outlineColor", label: "Outline colour" },
      { kind: "slider", key: "shadowOpacity", label: "Shadow", min: 0, max: 100, step: 1, unit: "%" },
      { kind: "slider", key: "shadowBlur", label: "Blur", min: 0, max: 40, step: 1, unit: "px" },
      { kind: "slider", key: "shadowX", label: "Shadow X", min: -20, max: 20, step: 1, unit: "px" },
      { kind: "slider", key: "shadowY", label: "Shadow Y", min: -20, max: 20, step: 1, unit: "px" },
      { kind: "color", key: "shadowColor", label: "Shadow colour" },
    ],
  },

  "bg-replace": {
    type: "bg-replace",
    label: "Replace BG",
    group: "bg",
    blurb: "Put a colour, gradient or image behind the cutout.",
    defaults: {
      mode: "none",
      color: "#f4f1e8",
      color2: "#d69c4a",
      angle: 90,
      assetId: "",
    },
    controls: [
      {
        kind: "select",
        key: "mode",
        label: "Backdrop",
        options: [
          { value: "none", label: "None" },
          { value: "color", label: "Solid colour" },
          { value: "gradient", label: "Gradient" },
          { value: "image", label: "Image" },
        ],
      },
      { kind: "color", key: "color", label: "Colour" },
      { kind: "color", key: "color2", label: "Colour 2" },
      { kind: "slider", key: "angle", label: "Angle", min: 0, max: 360, step: 5, unit: "°" },
      { kind: "image", key: "assetId", label: "Backdrop image" },
    ],
  },

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

/** Rail order. Also the order ops land in the stack when clicked top-to-bottom. */
export const OP_ORDER: string[] = ["bg-remove", "cutout-style", "bg-replace", "adjust"];

export function metaFor(type: string): OpMeta {
  const meta = OP_META[type];
  if (!meta) throw new Error(`Unknown op type: ${type}`);
  return meta;
}
