import { create } from "zustand";
import { pipeline, type Progress } from "@/lib/pipeline";
import { PREVIEW_MAX } from "@/lib/consts";
import { readExif, type ExifSummary } from "@/lib/exif";
import { metaFor } from "@/lib/ops/registry";
import type { Op, OpParams } from "@/lib/ops/types";

export interface SourceInfo {
  name: string;
  width: number;
  height: number;
  bytes: number;
  downscaledFrom?: { width: number; height: number };
}

interface EditorState {
  source: SourceInfo | null;
  /** Untouched preview-sized bitmap, kept for the compare slider. */
  original: ImageBitmap | null;
  preview: ImageBitmap | null;
  ops: Op[];
  activeOpId: string | null;
  busy: boolean;
  progress: Progress | null;
  error: string | null;
  /** Last colour read off the canvas, shown in the picker readout. */
  picked: string | null;
  /** When set, the next canvas click writes the colour into this op param. */
  pickTarget: { opId: string; key: string } | null;
  /** True while the crop op is selected and therefore bypassed in the preview. */
  cropEditing: boolean;
  exif: ExifSummary | null;

  loadFile: (file: File) => Promise<void>;
  setPickTarget: (t: { opId: string; key: string } | null) => void;
  pickColor: (hex: string) => void;
  addOp: (type: string) => void;
  updateParams: (id: string, params: OpParams) => void;
  toggleOp: (id: string) => void;
  removeOp: (id: string) => void;
  moveOp: (id: string, dir: -1 | 1) => void;
  setActiveOp: (id: string | null) => void;
  clearStack: () => void;
  reset: () => void;
}

let renderToken = 0;
let renderTimer: ReturnType<typeof setTimeout> | undefined;

export const useEditor = create<EditorState>((set, get) => {
  async function render() {
    if (!get().source) return;
    const token = ++renderToken;

    // While the crop tool is selected, bypass it so the full frame stays visible and
    // draggable — you can't drag a crop box on an already-cropped image. It re-applies
    // the moment another tool is selected.
    const { ops, activeOpId } = get();
    const active = ops.find((o) => o.id === activeOpId);
    const cropEditing = active?.type === "crop" && active.enabled;
    const renderOps = cropEditing
      ? ops.map((o) => (o.id === activeOpId ? { ...o, enabled: false } : o))
      : ops;

    set({ busy: true, cropEditing: Boolean(cropEditing) });
    try {
      const res = await pipeline.render(renderOps, PREVIEW_MAX);
      if (token !== renderToken) {
        // A newer render already landed; this result is stale.
        res.bitmap.close();
        return;
      }
      const stale = get().preview;
      set({ preview: res.bitmap, busy: false, error: null });
      stale?.close();
    } catch (err) {
      if (token !== renderToken) return;
      set({
        busy: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function schedule() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 60);
  }

  return {
    source: null,
    original: null,
    preview: null,
    ops: [],
    activeOpId: null,
    busy: false,
    progress: null,
    error: null,
    picked: null,
    pickTarget: null,
    cropEditing: false,
    exif: null,

    setPickTarget(t) {
      set({ pickTarget: t });
    },

    pickColor(hex) {
      const target = get().pickTarget;
      set({ picked: hex });
      if (target) {
        set({ pickTarget: null });
        get().updateParams(target.opId, { [target.key]: hex });
      }
    },

    async loadFile(file) {
      set({ busy: true, error: null });
      try {
        // from-image respects EXIF orientation — without it, phone photos load sideways.
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const [res, exif] = await Promise.all([pipeline.load(bitmap), readExif(file)]);
        get().original?.close();
        get().preview?.close();
        set({
          exif,
          source: {
            name: file.name.replace(/\.[^.]+$/, ""),
            width: res.width,
            height: res.height,
            bytes: file.size,
            downscaledFrom: res.downscaledFrom,
          },
          original: res.preview,
          preview: null,
          ops: [],
          activeOpId: null,
          busy: false,
        });
        render();
      } catch (err) {
        set({
          busy: false,
          error: err instanceof Error ? err.message : `Could not read ${file.name}`,
        });
      }
    },

    addOp(type) {
      const meta = metaFor(type);
      const existing = get().ops.find((o) => o.type === type);
      // One instance per op type keeps the stack readable; re-picking a tool focuses it.
      if (existing) {
        get().setActiveOp(existing.id);
        return;
      }
      const op: Op = {
        id: `${type}-${Date.now().toString(36)}`,
        type,
        enabled: true,
        params: { ...meta.defaults },
      };
      set({ ops: [...get().ops, op], activeOpId: op.id });
      schedule();
    },

    updateParams(id, params) {
      set({
        ops: get().ops.map((o) =>
          o.id === id ? { ...o, params: { ...o.params, ...params } } : o,
        ),
      });
      schedule();
    },

    toggleOp(id) {
      set({
        ops: get().ops.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o)),
      });
      schedule();
    },

    removeOp(id) {
      set({
        ops: get().ops.filter((o) => o.id !== id),
        activeOpId: get().activeOpId === id ? null : get().activeOpId,
      });
      schedule();
    },

    moveOp(id, dir) {
      const ops = [...get().ops];
      const i = ops.findIndex((o) => o.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ops.length) return;
      [ops[i], ops[j]] = [ops[j], ops[i]];
      set({ ops });
      schedule();
    },

    setActiveOp(id) {
      set({ activeOpId: id });
      // Re-render: selecting or leaving the crop tool changes what the preview shows.
      schedule();
    },

    clearStack() {
      set({ ops: [], activeOpId: null });
      schedule();
    },

    reset() {
      get().original?.close();
      get().preview?.close();
      set({
        source: null,
        original: null,
        preview: null,
        ops: [],
        activeOpId: null,
        error: null,
        exif: null,
        picked: null,
      });
    },
  };
});

// Progress arrives on a side channel (model download, inference) rather than as a
// response, so it's piped into the store rather than awaited.
pipeline.onProgress((p) => useEditor.setState({ progress: p }));

/** Non-hook accessor for use outside React (matches the p2p store convention). */
export const editor = {
  get state() {
    return useEditor.getState();
  },
};
