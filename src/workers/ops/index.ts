import type { ApplyFn } from "@/lib/ops/types";
import { adjust } from "./adjust";

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
  adjust,
};
