import { useEffect, useState } from "react";
import { hasWebGPU } from "@/lib/gpu";
import { metaFor } from "@/lib/ops/registry";
import type { Control, Op } from "@/lib/ops/types";
import { pipeline } from "@/lib/pipeline";
import { useEditor } from "@/stores/editorStore";

/**
 * A cutout is ~0.6s on WebGPU and ~25s without it. Say so before someone starts,
 * rather than letting them wonder whether the tab has hung.
 */
function BgRemoveNote() {
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    hasWebGPU().then(setGpu);
  }, []);

  if (gpu === null || gpu) return null;
  return (
    <p className="text-[11px] text-accent">
      This browser has no WebGPU, so a cutout takes around 25 seconds. It still works —
      it's just slow. Everything else here stays instant.
    </p>
  );
}

function ColorRow({ op, control }: { op: Op; control: Control & { kind: "color" } }) {
  const updateParams = useEditor((s) => s.updateParams);
  const pickTarget = useEditor((s) => s.pickTarget);
  const setPickTarget = useEditor((s) => s.setPickTarget);
  const value = String(op.params[control.key]);
  const arming = pickTarget?.opId === op.id && pickTarget.key === control.key;

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-text-muted">{control.label}</span>
      <span className="flex items-center gap-1.5">
        <span className="display">{value}</span>
        {/* Typing a hex for a colour that's already in the image is absurd — let them
            point at it. This is what makes chroma key usable. */}
        <button
          type="button"
          title="Pick from image"
          onClick={() => setPickTarget(arming ? null : { opId: op.id, key: control.key })}
          className={`border px-1.5 py-0.5 ${
            arming ? "border-accent text-accent" : "border-border text-text-muted"
          } hover:border-accent hover:text-accent`}
        >
          ⌖
        </button>
        <input
          type="color"
          value={value}
          onChange={(e) => updateParams(op.id, { [control.key]: e.target.value })}
          className="h-6 w-8 cursor-pointer border border-border bg-transparent p-0"
        />
      </span>
    </div>
  );
}

function ControlRow({ op, control }: { op: Op; control: Control }) {
  const updateParams = useEditor((s) => s.updateParams);
  const value = op.params[control.key];

  switch (control.kind) {
    case "slider":
      return (
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="text-text-muted">{control.label}</span>
            <span className="display">
              {String(value)}
              {control.unit ?? ""}
            </span>
          </div>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(value)}
            onChange={(e) =>
              updateParams(op.id, { [control.key]: Number(e.target.value) })
            }
          />
        </label>
      );

    case "toggle":
      return (
        <label className="flex cursor-pointer items-center justify-between text-[11px]">
          <span className="text-text-muted">{control.label}</span>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => updateParams(op.id, { [control.key]: e.target.checked })}
            className="accent-accent"
          />
        </label>
      );

    case "color":
      return <ColorRow op={op} control={control} />;

    case "image":
      return (
        <label className="block text-[11px]">
          <span className="mb-1.5 block text-text-muted">{control.label}</span>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const bitmap = await createImageBitmap(file, {
                imageOrientation: "from-image",
              });
              // Timestamped so re-picking an image changes the param, which is what
              // invalidates the pipeline's cache for this op.
              const assetId = `${op.id}:${control.key}:${Date.now().toString(36)}`;
              await pipeline.setAsset(assetId, bitmap);
              updateParams(op.id, { [control.key]: assetId });
              e.target.value = "";
            }}
            className="w-full text-[10px] text-text-muted file:mr-2 file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-[10px] file:text-text"
          />
          {value ? <span className="mt-1 block text-accent">Image loaded</span> : null}
        </label>
      );

    case "select":
      return (
        <label className="block text-[11px]">
          <span className="mb-1.5 block text-text-muted">{control.label}</span>
          <select
            value={String(value)}
            onChange={(e) => updateParams(op.id, { [control.key]: e.target.value })}
            className="w-full border border-border bg-surface px-2 py-1.5 text-xs text-text"
          >
            {control.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
  }
}

export default function OpControls() {
  const ops = useEditor((s) => s.ops);
  const activeOpId = useEditor((s) => s.activeOpId);
  const updateParams = useEditor((s) => s.updateParams);

  const op = ops.find((o) => o.id === activeOpId);
  if (!op) return null;
  const meta = metaFor(op.type);

  return (
    <div className="tile rise p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="display text-xs">{meta.label}</span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => updateParams(op.id, { ...meta.defaults })}
        >
          Reset
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {op.type === "bg-remove" && <BgRemoveNote />}
        {meta.controls.map((c) => (
          <ControlRow key={c.key} op={op} control={c} />
        ))}
      </div>
    </div>
  );
}
