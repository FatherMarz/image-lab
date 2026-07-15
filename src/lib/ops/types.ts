export type OpGroup = "bg" | "color" | "transform" | "meta";

export type OpParams = Record<string, number | string | boolean>;

export interface Op {
  id: string;
  type: string;
  enabled: boolean;
  params: OpParams;
}

export type Control =
  | {
      kind: "slider";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | { kind: "toggle"; key: string; label: string }
  | { kind: "color"; key: string; label: string }
  /** Picks a side image; the param holds an assetId registered with the worker. */
  | { kind: "image"; key: string; label: string }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
    };

export interface OpMeta {
  type: string;
  label: string;
  /**
   * Name for the two-column tool rail, where ~13 characters fit. The group heading
   * above the button carries the noun, so "Delete" under COLOUR is unambiguous.
   * Falls back to `label`. Everywhere else — the stack, the controls header — uses
   * the full label, because there the tool has no heading to lean on.
   */
  short?: string;
  group: OpGroup;
  blurb: string;
  defaults: OpParams;
  controls: Control[];
}

/**
 * Params carrying geometry MUST be normalized 0..1 against image dimensions, and
 * params in pixel units MUST be multiplied by ctx.scale inside apply(). The preview
 * pipeline runs at a downscaled resolution and export runs at full resolution — any
 * param left in raw pixels renders differently between the two.
 */
export interface OpContext {
  /** renderWidth / sourceWidth. 1 on export, <1 on preview. */
  scale: number;
  /**
   * Cumulative cache key of this op's INPUT. Ops holding expensive derived state
   * (a segmentation mask, say) key that state on this so tweaking a cheap param
   * like threshold reuses it instead of re-running inference.
   */
  inputKey: string;
  /** Surface long-running work (model download, inference) to the UI. */
  report: (phase: string, loaded?: number, total?: number) => void;
}

export type ApplyFn = (
  ctx: OpContext,
  input: ImageData,
  params: OpParams,
) => ImageData | Promise<ImageData>;
