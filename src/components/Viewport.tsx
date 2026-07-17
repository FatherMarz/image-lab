import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/stores/editorStore";
import { rgbToHex } from "@/lib/color";
import { bytes, dims } from "@/lib/format";

export default function Viewport() {
  const preview = useEditor((s) => s.preview);
  const original = useEditor((s) => s.original);
  const source = useEditor((s) => s.source);
  const busy = useEditor((s) => s.busy);
  const progress = useEditor((s) => s.progress);
  const error = useEditor((s) => s.error);

  const pickTarget = useEditor((s) => s.pickTarget);
  const pickColor = useEditor((s) => s.pickColor);
  const cropEditing = useEditor((s) => s.cropEditing);
  const ops = useEditor((s) => s.ops);
  const activeOpId = useEditor((s) => s.activeOpId);
  const updateParams = useEditor((s) => s.updateParams);

  const cropOp = cropEditing ? ops.find((o) => o.id === activeOpId) : undefined;
  const active = ops.find((o) => o.id === activeOpId);
  const redactOp = active?.type === "redact" && active.enabled ? active : undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [comparing, setComparing] = useState(false);
  const [split, setSplit] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const cropStart = useRef<{ x: number; y: number } | null>(null);

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

    if (cropOp) {
      const { x, y, w, h } = cropOp.params as Record<string, number>;
      const rx = x * c.width;
      const ry = y * c.height;
      const rw = w * c.width;
      const rh = h * c.height;

      // Darken everything outside the box so the keep-area reads immediately.
      cx.fillStyle = "rgba(20, 22, 18, 0.66)";
      cx.fillRect(0, 0, c.width, ry);
      cx.fillRect(0, ry + rh, c.width, c.height - (ry + rh));
      cx.fillRect(0, ry, rx, rh);
      cx.fillRect(rx + rw, ry, c.width - (rx + rw), rh);

      cx.strokeStyle = "rgb(214, 156, 74)";
      cx.lineWidth = Math.max(1, c.width / 400);
      cx.strokeRect(rx, ry, rw, rh);

      // Thirds guides
      cx.globalAlpha = 0.35;
      cx.lineWidth = Math.max(1, c.width / 900);
      for (let i = 1; i < 3; i++) {
        cx.beginPath();
        cx.moveTo(rx + (rw / 3) * i, ry);
        cx.lineTo(rx + (rw / 3) * i, ry + rh);
        cx.moveTo(rx, ry + (rh / 3) * i);
        cx.lineTo(rx + rw, ry + (rh / 3) * i);
        cx.stroke();
      }
      cx.globalAlpha = 1;
    }
  }, [preview, original, comparing, split, cropOp]);

  function updateSplit(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setSplit(Math.min(1, Math.max(0, f)));
  }

  /** Read the pixel under the cursor. The canvas is CSS-scaled, so map through its
   * bounding rect rather than using offsetX/offsetY. */
  function sample(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
    const d = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
    pickColor(rgbToHex(d[0], d[1], d[2]));
  }

  /** Cursor position in normalized 0..1 image space, which is how crop params are stored. */
  function norm(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  /** Commit the dragged box as another redaction region. */
  function commitRedact(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!redactOp || !cropStart.current) return;
    const p = norm(e);
    const s = cropStart.current;
    const x = Math.min(s.x, p.x);
    const y = Math.min(s.y, p.y);
    const w = Math.abs(p.x - s.x);
    const h = Math.abs(p.y - s.y);
    if (w < 0.01 || h < 0.01) return;

    let regions: unknown[] = [];
    try {
      regions = JSON.parse(String(redactOp.params.regions || "[]"));
    } catch {
      regions = [];
    }
    updateParams(redactOp.id, {
      regions: JSON.stringify([...regions, { x, y, w, h }]),
    });
  }

  function dragCrop(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!cropOp || !cropStart.current) return;
    const p = norm(e);
    const s = cropStart.current;

    let x = Math.min(s.x, p.x);
    let y = Math.min(s.y, p.y);
    let w = Math.abs(p.x - s.x);
    let h = Math.abs(p.y - s.y);

    const ratio = Number(cropOp.params.ratio) || 0;
    if (ratio > 0) {
      // Ratio is in pixel space, so convert through the image's own aspect before
      // constraining the normalized box.
      const c = canvasRef.current!;
      const imgAspect = c.width / c.height;
      const target = ratio / imgAspect;
      if (w / h > target) w = h * target;
      else h = w / target;
      x = Math.min(s.x, p.x) === s.x ? s.x : s.x - w;
      y = Math.min(s.y, p.y) === s.y ? s.y : s.y - h;
    }

    if (w < 0.02 || h < 0.02) return;
    updateParams(cropOp.id, {
      x: Math.max(0, Math.min(x, 1 - w)),
      y: Math.max(0, Math.min(y, 1 - h)),
      w,
      h,
    });
  }

  const downloading = progress?.phase === "downloading" && progress.total;
  const pct = downloading ? ((progress.loaded ?? 0) / progress.total!) * 100 : 0;

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* The model is tens of megabytes on first use — report real bytes, not a spinner. */}
      {downloading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80">
          <div className="tile rise w-72 p-4">
            <div className="stamp mb-2">Fetching model</div>
            <p className="mb-3 text-[11px] text-text-muted">
              One time only. It's cached in your browser afterwards.
            </p>
            <div className="mb-1.5 h-1 w-full bg-border">
              <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>{bytes(progress.loaded ?? 0)}</span>
              <span>{bytes(progress.total!)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="checker flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
        {preview ? (
          <canvas
            ref={canvasRef}
            // touch-none: crop/redact/compare are pointer drags on the canvas. Without
            // it a touch drag scrolls or zooms the page and the pointermove never lands.
            className="max-h-full max-w-full touch-none object-contain"
            style={{ cursor: comparing ? "ew-resize" : "crosshair" }}
            onClick={(e) => {
              if (!comparing && !cropOp && !redactOp) sample(e);
            }}
            onPointerDown={(e) => {
              if (!comparing && !cropOp && !redactOp) return;
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              if (cropOp || redactOp) cropStart.current = norm(e);
              else updateSplit(e);
            }}
            onPointerMove={(e) => {
              if (!dragging) return;
              // Redact commits on release: appending per move would add hundreds of
              // overlapping regions.
              if (cropOp) dragCrop(e);
              else if (!redactOp) updateSplit(e);
            }}
            onPointerUp={(e) => {
              if (dragging && redactOp) commitRedact(e);
              setDragging(false);
              cropStart.current = null;
            }}
            onPointerCancel={() => {
              setDragging(false);
              cropStart.current = null;
            }}
          />
        ) : (
          <span className="text-xs text-text-muted">Rendering…</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface/40 px-4 py-2 text-[11px] text-text-muted">
        <div className="flex items-center gap-3">
          {source && <span>{dims(source.width, source.height)}</span>}
          {source?.downscaledFrom && (
            <span className="text-accent">
              downscaled from {dims(source.downscaledFrom.width, source.downscaledFrom.height)}
            </span>
          )}
          {busy && (
            <span className="flex items-center gap-1.5">
              <span className="live-dot" />
              {progress?.phase === "segmenting" || progress?.phase === "tracing"
                ? progress.phase
                : "working"}
            </span>
          )}
          {error && <span className="text-accent">{error}</span>}
        </div>

        <div className="flex items-center gap-3">
          {cropOp && <span className="text-accent">Drag a box to crop</span>}
          {redactOp && <span className="text-accent">Drag boxes over what to hide</span>}
          {pickTarget && <span className="text-accent">Tap the image to pick a colour</span>}
          <button
            type="button"
            className={`btn btn-sm ${comparing ? "btn-primary" : ""}`}
            onClick={() => setComparing((v) => !v)}
          >
            {comparing ? "Comparing" : "Compare"}
          </button>
        </div>
      </div>
    </div>
  );
}
