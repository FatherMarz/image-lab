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
    short: "Remove",
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
    short: "Outline",
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
    short: "Replace",
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

  "color-delete": {
    type: "color-delete",
    label: "Delete Colour",
    short: "Delete",
    group: "color",
    blurb: "Make one colour transparent. Pick it off the image with the dropper.",
    defaults: {
      color: "#00b140",
      tolerance: 20,
      softness: 15,
      despill: true,
    },
    controls: [
      { kind: "color", key: "color", label: "Colour" },
      { kind: "slider", key: "tolerance", label: "Tolerance", min: 0, max: 100, step: 1 },
      { kind: "slider", key: "softness", label: "Softness", min: 0, max: 100, step: 1 },
      { kind: "toggle", key: "despill", label: "Remove edge fringe" },
    ],
  },

  "color-swap": {
    type: "color-swap",
    label: "Swap Colour",
    short: "Swap",
    group: "color",
    blurb: "Recolour one colour into another, keeping shading intact.",
    defaults: {
      from: "#dc2626",
      to: "#2563eb",
      tolerance: 25,
      softness: 20,
      preserveLuma: true,
    },
    controls: [
      { kind: "color", key: "from", label: "From" },
      { kind: "color", key: "to", label: "To" },
      { kind: "slider", key: "tolerance", label: "Tolerance", min: 0, max: 100, step: 1 },
      { kind: "slider", key: "softness", label: "Softness", min: 0, max: 100, step: 1 },
      { kind: "toggle", key: "preserveLuma", label: "Keep lightness" },
    ],
  },

  duotone: {
    type: "duotone",
    label: "Duotone",
    group: "color",
    blurb: "Map brightness onto a colour ramp.",
    // A near-black to near-white ramp is just greyscale, which is a pointless default
    // for a duotone. Ramp into the accent so the tool shows what it does on contact.
    defaults: {
      shadow: "#242721",
      mid: "#7a8057",
      highlight: "#d69c4a",
      useMid: false,
      amount: 100,
    },
    controls: [
      { kind: "color", key: "shadow", label: "Shadows" },
      { kind: "toggle", key: "useMid", label: "Add midtone" },
      { kind: "color", key: "mid", label: "Midtone" },
      { kind: "color", key: "highlight", label: "Highlights" },
      { kind: "slider", key: "amount", label: "Amount", min: 0, max: 100, step: 1, unit: "%" },
    ],
  },

  colorblind: {
    type: "colorblind",
    label: "Colourblind Sim",
    short: "Colourblind",
    group: "color",
    blurb: "Preview the image as a dichromat sees it.",
    defaults: { type: "deuteranopia" },
    controls: [
      {
        kind: "select",
        key: "type",
        label: "Type",
        options: [
          { value: "deuteranopia", label: "Deuteranopia (green)" },
          { value: "protanopia", label: "Protanopia (red)" },
          { value: "tritanopia", label: "Tritanopia (blue)" },
        ],
      },
    ],
  },

  adjust: {
    type: "adjust",
    label: "Adjust",
    group: "transform",
    blurb: "Brightness, contrast, saturation, sharpen.",
    defaults: { brightness: 0, contrast: 0, saturation: 0, sharpen: 0 },
    controls: [
      { kind: "slider", key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
      { kind: "slider", key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
      { kind: "slider", key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
      { kind: "slider", key: "sharpen", label: "Sharpen", min: 0, max: 100, step: 1 },
    ],
  },

  frame: {
    type: "frame",
    label: "Screenshot Polish",
    short: "Polish",
    group: "transform",
    blurb: "Padding, backdrop, rounded corners and a drop shadow.",
    defaults: {
      padding: 8,
      mode: "gradient",
      color: "#7a8057",
      color2: "#242721",
      angle: 135,
      radius: 4,
      shadowOpacity: 35,
      shadowBlur: 24,
    },
    controls: [
      { kind: "slider", key: "padding", label: "Padding", min: 0, max: 30, step: 1, unit: "%" },
      {
        kind: "select",
        key: "mode",
        label: "Backdrop",
        options: [
          { value: "gradient", label: "Gradient" },
          { value: "color", label: "Solid colour" },
          { value: "none", label: "Transparent" },
        ],
      },
      { kind: "color", key: "color", label: "Colour" },
      { kind: "color", key: "color2", label: "Colour 2" },
      { kind: "slider", key: "angle", label: "Angle", min: 0, max: 360, step: 5, unit: "°" },
      { kind: "slider", key: "radius", label: "Corner radius", min: 0, max: 20, step: 1, unit: "%" },
      { kind: "slider", key: "shadowOpacity", label: "Shadow", min: 0, max: 100, step: 1, unit: "%" },
      { kind: "slider", key: "shadowBlur", label: "Shadow blur", min: 0, max: 60, step: 1, unit: "px" },
    ],
  },

  redact: {
    type: "redact",
    label: "Redact",
    group: "meta",
    blurb: "Drag boxes over anything you need to hide.",
    defaults: { regions: "[]", mode: "pixelate", strength: 12 },
    controls: [
      {
        kind: "select",
        key: "mode",
        label: "Style",
        options: [
          { value: "pixelate", label: "Pixelate" },
          { value: "fill", label: "Solid block" },
        ],
      },
      { kind: "slider", key: "strength", label: "Block size", min: 2, max: 40, step: 1, unit: "%" },
    ],
  },

  dither: {
    type: "dither",
    label: "Dither",
    group: "color",
    blurb: "Error-diffusion dithering. Fewer levels, more texture.",
    defaults: { algorithm: "floyd", levels: 2, mono: true },
    controls: [
      {
        kind: "select",
        key: "algorithm",
        label: "Algorithm",
        options: [
          { value: "floyd", label: "Floyd–Steinberg" },
          { value: "atkinson", label: "Atkinson" },
        ],
      },
      { kind: "slider", key: "levels", label: "Levels", min: 2, max: 8, step: 1 },
      { kind: "toggle", key: "mono", label: "Monochrome" },
    ],
  },

  crop: {
    type: "crop",
    label: "Crop",
    group: "transform",
    blurb: "Drag a box on the image. Presets for social and OG sizes.",
    defaults: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, aspect: "free" },
    controls: [],
  },

  resize: {
    type: "resize",
    // Named for both jobs on purpose: "Resize" alone made the upscale impossible to
    // find for someone looking for an upscaler.
    label: "Resize + Upscale",
    // "Upscale" over "Resize" in the rail: scaling down is the obvious half, and the
    // 1x-4x buttons make it plain once you're in. Upscaling is what you'd hunt for.
    short: "Upscale",
    group: "transform",
    blurb: "Scale up or down with Lanczos resampling. 2x / 3x / 4x presets.",
    defaults: { mode: "percent", percent: 100, width: 1200, height: 800, lockAspect: true },
    controls: [
      {
        kind: "select",
        key: "mode",
        label: "Mode",
        options: [
          { value: "percent", label: "Percent" },
          { value: "pixels", label: "Pixels" },
        ],
      },
      { kind: "slider", key: "percent", label: "Scale", min: 10, max: 400, step: 5, unit: "%" },
    ],
  },

  orient: {
    type: "orient",
    label: "Rotate + Flip",
    short: "Rotate",
    group: "transform",
    blurb: "Rotate in quarter turns, mirror horizontally or vertically.",
    defaults: { angle: 0, flipH: false, flipV: false },
    controls: [
      {
        kind: "select",
        key: "angle",
        label: "Rotate",
        options: [
          { value: "0", label: "0°" },
          { value: "90", label: "90°" },
          { value: "180", label: "180°" },
          { value: "270", label: "270°" },
        ],
      },
      { kind: "toggle", key: "flipH", label: "Flip horizontal" },
      { kind: "toggle", key: "flipV", label: "Flip vertical" },
    ],
  },
};

/** Crop presets. "OG" is the 1.91:1 ratio link previews use. */
export const CROP_PRESETS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "og", label: "OG", ratio: 1200 / 630 },
];

/** Rail order. Also the order ops land in the stack when clicked top-to-bottom. */
export const OP_ORDER: string[] = [
  "bg-remove",
  "cutout-style",
  "bg-replace",
  "color-delete",
  "color-swap",
  "duotone",
  "dither",
  "colorblind",
  "crop",
  "resize",
  "orient",
  "adjust",
  "frame",
  "redact",
];

export function metaFor(type: string): OpMeta {
  const meta = OP_META[type];
  if (!meta) throw new Error(`Unknown op type: ${type}`);
  return meta;
}
