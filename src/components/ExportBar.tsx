import { useEffect, useState } from "react";
import { PREVIEW_MAX } from "@/lib/consts";
import { bytes, download } from "@/lib/format";
import {
  FORMAT_EXT,
  FORMAT_LABELS,
  HAS_ALPHA,
  LOSSY,
  VECTOR,
  detectFormats,
} from "@/lib/formats";
import { pipeline } from "@/lib/pipeline";
import type { ExportFormat } from "@/lib/protocol";
import { useEditor } from "@/stores/editorStore";

export default function ExportBar() {
  const source = useEditor((s) => s.source);
  const preview = useEditor((s) => s.preview);
  const ops = useEditor((s) => s.ops);

  const format = useEditor((s) => s.exportFormat);
  const quality = useEditor((s) => s.exportQuality);
  const setFormat = useEditor((s) => s.setExportFormat);
  const setQuality = useEditor((s) => s.setExportQuality);

  const [formats, setFormats] = useState<ExportFormat[]>(["image/png"]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    detectFormats().then(setFormats);
  }, []);

  // Encode the preview and scale by the pixel ratio. Cheap, and exact whenever the
  // source is already under PREVIEW_MAX (scale 1). Labelled "~" because it isn't
  // exact for larger images.
  useEffect(() => {
    if (!preview || !source) return;
    // SVG is traced, not encoded — its size has no relationship to pixel count, so
    // any estimate here would be a fabrication.
    if (VECTOR.includes(format)) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const c = document.createElement("canvas");
      c.width = preview.width;
      c.height = preview.height;
      const cx = c.getContext("2d")!;
      if (!HAS_ALPHA.includes(format)) {
        cx.fillStyle = "#ffffff";
        cx.fillRect(0, 0, c.width, c.height);
      }
      cx.drawImage(preview, 0, 0);
      const blob = await new Promise<Blob | null>((r) =>
        c.toBlob(r, format, quality / 100),
      );
      if (cancelled || !blob) return;
      const scale = Math.min(1, PREVIEW_MAX / Math.max(source.width, source.height));
      setEstimate(blob.size / (scale * scale));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [preview, source, format, quality]);

  async function doExport() {
    if (!source) return;
    setExporting(true);
    try {
      const res = await pipeline.exportImage(ops, format, quality / 100);
      const suffix = ops
        .filter((o) => o.enabled)
        .map((o) => o.type)
        .join("_");
      const name = `${source.name}${suffix ? `_${suffix}` : ""}.${FORMAT_EXT[format]}`;
      download(res.blob, name);
    } finally {
      setExporting(false);
    }
  }

  const lossy = LOSSY.includes(format);
  const vector = VECTOR.includes(format);

  return (
    // Every row renders in every state, with a reserved note line. Showing and hiding
    // the quality slider per format moved the Download button under the cursor.
    <div className="tile flex flex-col gap-2 p-3">
      <div className="stamp h-4">Export</div>

      <div className="grid grid-cols-4 gap-1">
        {formats.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className={`btn btn-sm ${format === f ? "btn-primary" : ""}`}
          >
            {FORMAT_LABELS[f]}
          </button>
        ))}
      </div>

      <label className="block">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-text-muted">{vector ? "Colours" : "Quality"}</span>
          <span className="display">
            {!lossy ? "lossless" : vector ? Math.max(2, Math.round((quality / 100) * 32)) : quality}
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={quality}
          disabled={!lossy}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="disabled:opacity-40"
        />
      </label>

      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span>Estimated</span>
        <span className="display text-text">
          {vector ? "—" : estimate ? `~${bytes(estimate)}` : "—"}
        </span>
      </div>

      <p className="h-6 text-[10px] leading-tight text-accent">
        {vector
          ? "Traced to paths. Clean on flat art, messy on photos."
          : !HAS_ALPHA.includes(format)
            ? `${FORMAT_LABELS[format]} has no transparency — cutouts flatten onto white.`
            : ""}
      </p>

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={doExport}
        disabled={exporting}
      >
        {exporting ? "Rendering full size…" : "Download"}
      </button>
    </div>
  );
}
