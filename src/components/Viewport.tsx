import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/stores/editorStore";
import { dims } from "@/lib/format";

export default function Viewport() {
  const preview = useEditor((s) => s.preview);
  const original = useEditor((s) => s.original);
  const source = useEditor((s) => s.source);
  const busy = useEditor((s) => s.busy);
  const error = useEditor((s) => s.error);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [comparing, setComparing] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !preview) return;
    c.width = preview.width;
    c.height = preview.height;
    const cx = c.getContext("2d")!;
    cx.clearRect(0, 0, c.width, c.height);
    cx.drawImage(preview, 0, 0);

    if (comparing && original) {
      // Left of the divider shows the untouched original. Scaled to the processed
      // canvas so a crop or resize still lines up rather than offsetting.
      cx.save();
      cx.beginPath();
      cx.rect(0, 0, c.width * split, c.height);
      cx.clip();
      cx.drawImage(original, 0, 0, c.width, c.height);
      cx.restore();

      const x = Math.round(c.width * split);
      cx.fillStyle = "rgb(214, 156, 74)";
      cx.fillRect(x - 1, 0, 2, c.height);
    }
  }, [preview, original, comparing, split]);

  function updateSplit(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setSplit(Math.min(1, Math.max(0, f)));
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="checker flex flex-1 items-center justify-center overflow-hidden p-6">
        {preview ? (
          <canvas
            ref={canvasRef}
            className="max-h-full max-w-full object-contain"
            style={{ cursor: comparing ? "ew-resize" : "default" }}
            onPointerDown={(e) => {
              if (!comparing) return;
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              updateSplit(e);
            }}
            onPointerMove={(e) => dragging && updateSplit(e)}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
          />
        ) : (
          <span className="text-xs text-text-muted">Rendering…</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border bg-surface/40 px-4 py-2 text-[11px] text-text-muted">
        <div className="flex items-center gap-3">
          {source && <span>{dims(source.width, source.height)}</span>}
          {source?.downscaledFrom && (
            <span className="text-accent">
              downscaled from {dims(source.downscaledFrom.width, source.downscaledFrom.height)}
            </span>
          )}
          {busy && (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" /> working
            </span>
          )}
          {error && <span className="text-accent">{error}</span>}
        </div>

        <button
          type="button"
          className={`btn btn-sm ${comparing ? "btn-primary" : ""}`}
          onClick={() => setComparing((v) => !v)}
        >
          {comparing ? "Comparing" : "Compare"}
        </button>
      </div>
    </div>
  );
}
