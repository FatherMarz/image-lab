import { metaFor } from "@/lib/ops/registry";
import type { Control, Op } from "@/lib/ops/types";
import { useEditor } from "@/stores/editorStore";

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
      return (
        <label className="flex items-center justify-between text-[11px]">
          <span className="text-text-muted">{control.label}</span>
          <span className="flex items-center gap-2">
            <span className="display">{String(value)}</span>
            <input
              type="color"
              value={String(value)}
              onChange={(e) => updateParams(op.id, { [control.key]: e.target.value })}
              className="h-6 w-8 cursor-pointer border border-border bg-transparent p-0"
            />
          </span>
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
        {meta.controls.map((c) => (
          <ControlRow key={c.key} op={op} control={c} />
        ))}
      </div>
    </div>
  );
}
