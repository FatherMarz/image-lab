import { create } from "zustand";
import { pipeline, type Progress } from "@/lib/pipeline";
import { PREVIEW_MAX } from "@/lib/consts";
import { readExif, type ExifSummary } from "@/lib/exif";
import { svgToBitmap } from "@/lib/svg";
import { traceFor } from "@/lib/trace";
import type { ExportFormat } from "@/lib/protocol";
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
  /** True when the viewport is showing traced paths rather than the raster render. */
  tracing: boolean;
  exif: ExifSummary | null;
  /** Export settings live here so batch and icon runs use the same choices. */
  exportFormat: ExportFormat;
  exportQuality: number;
  setExportFormat: (f: ExportFormat) => void;
  setExportQuality: (q: number) => void;

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
    const { ops, activeOpId, exportFormat } = get();
    const active = ops.find((o) => o.id === activeOpId);
    const cropEditing = active?.type === "crop" && active.enabled;
    const renderOps = cropEditing
      ? ops.map((o) => (o.id === activeOpId ? { ...o, enabled: false } : o))
      : ops;

    // The Vectorize tool traces; so does picking SVG without it. Suspended while
    // dragging a crop box, where a seconds-long retrace per pointer move would make
    // the box undraggable.
    const params = traceFor(renderOps, exportFormat);
    const tracing = Boolean(params) && !cropEditing;

    set({ busy: true, cropEditing: Boolean(cropEditing), tracing });
    try {
      let bitmap: ImageBitmap;
      if (tracing) {
        const res = await pipeline.trace(renderOps, PREVIEW_MAX, params!);
        if (token !== renderToken) return;
        bitmap = await svgToBitmap(res.svg, res.width, res.height);
      } else {
        const res = await pipeline.render(renderOps, PREVIEW_MAX);
        bitmap = res.bitmap;
      }
      if (token !== renderToken) {
        // A newer render already landed; this result is stale.
        bitmap.close();
        return;
      }
      const stale = get().preview;
      set({ preview: bitmap, busy: false, error: null });
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
    // A trace costs seconds where a raster render costs milliseconds, so let the
    // input settle for longer before starting one.
    const delay = traceFor(get().ops, get().exportFormat) ? 250 : 60;
    renderTimer = setTimeout(render, delay);
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
    tracing: false,
    exif: null,
    exportFormat: "image/png",
    exportQuality: 90,

    setExportFormat(f) {
      const had = Boolean(traceFor(get().ops, get().exportFormat));
      set({ exportFormat: f });
      // Format only changes the preview when the trace comes or goes — with the
      // Vectorize tool in the stack it's already tracing either way.
      if (had !== Boolean(traceFor(get().ops, f))) schedule();
    },
    setExportQuality(q) {
      // Encoder setting only. The trace is the Vectorize tool's business.
      set({ exportQuality: q });
    },

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
      // A terminal op has to stay last, so everything else tucks in ahead of it
      // rather than landing after and being silently ignored.
      const ops = [...get().ops];
      const at = meta.terminal ? ops.length : ops.findIndex((o) => metaFor(o.type).terminal);
      ops.splice(at < 0 ? ops.length : at, 0, op);
      set({ ops, activeOpId: op.id });
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
      // Neither dragging a terminal op off the end nor pushing another op past it.
      if (metaFor(ops[i].type).terminal || metaFor(ops[j].type).terminal) return;
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
