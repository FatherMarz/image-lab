import { create } from "zustand";
import { pipeline, type Progress } from "@/lib/pipeline";
import { PREVIEW_MAX } from "@/lib/consts";
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

  loadFile: (file: File) => Promise<void>;
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
    set({ busy: true });
    try {
      const res = await pipeline.render(get().ops, PREVIEW_MAX);
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

    async loadFile(file) {
      set({ busy: true, error: null });
      try {
        // from-image respects EXIF orientation — without it, phone photos load sideways.
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const res = await pipeline.load(bitmap);
        get().original?.close();
        get().preview?.close();
        set({
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
        set({ activeOpId: existing.id });
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
