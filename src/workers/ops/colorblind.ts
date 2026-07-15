import { delinearize, linearize } from "@/lib/color";
import type { ApplyFn } from "@/lib/ops/types";

/**
 * Viénot/Brettel dichromat simulation matrices, applied in LINEAR light — running them
 * on gamma-encoded sRGB gives noticeably wrong colours.
 */
const MATRICES: Record<string, number[]> = {
  protanopia: [0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1],
  deuteranopia: [0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1],
  tritanopia: [1, 0.14461, -0.14461, 0, 0.85659, 0.14341, 0, 0.85659, 0.14341],
};

export const colorblind: ApplyFn = (_ctx, input, params) => {
  const m = MATRICES[String(params.type)];
  if (!m) return input;

  const out = new ImageData(
    new Uint8ClampedArray(input.data),
    input.width,
    input.height,
  );
  const d = out.data;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = linearize(d[i]);
    const g = linearize(d[i + 1]);
    const b = linearize(d[i + 2]);
    d[i] = delinearize(m[0] * r + m[1] * g + m[2] * b);
    d[i + 1] = delinearize(m[3] * r + m[4] * g + m[5] * b);
    d[i + 2] = delinearize(m[6] * r + m[7] * g + m[8] * b);
  }

  return out;
};
