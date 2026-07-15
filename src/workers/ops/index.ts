import type { ApplyFn } from "@/lib/ops/types";
import { adjust } from "./adjust";
import { bgRemove } from "./bgRemove";
import { bgReplace } from "./bgReplace";
import { colorblind } from "./colorblind";
import { colorDelete } from "./colorDelete";
import { colorSwap } from "./colorSwap";
import { crop } from "./crop";
import { cutoutStyle } from "./cutoutStyle";
import { duotone } from "./duotone";
import { orient } from "./orient";
import { resize } from "./resize";

/**
 * Worker-side op implementations, keyed to OP_META in src/lib/ops/registry.ts.
 *
 * Contract every apply() must honour:
 *  - Return a NEW ImageData. Mutating `input` corrupts the prefix cache, which hands
 *    the same ImageData to the next render.
 *  - Read pixel-unit params through ctx.scale, and geometry as normalized 0..1.
 *    Preview renders downscaled; export renders full-size. See OpContext.
 */
export const APPLY: Record<string, ApplyFn> = {
  "bg-remove": bgRemove,
  "cutout-style": cutoutStyle,
  "bg-replace": bgReplace,
  "color-delete": colorDelete,
  "color-swap": colorSwap,
  duotone,
  colorblind,
  crop,
  resize,
  orient,
  adjust,
};
