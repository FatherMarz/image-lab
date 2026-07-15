import { metaFor } from "@/lib/ops/registry";
import { useEditor } from "@/stores/editorStore";

export default function StackPanel() {
  const ops = useEditor((s) => s.ops);
  const activeOpId = useEditor((s) => s.activeOpId);
  const setActiveOp = useEditor((s) => s.setActiveOp);
  const toggleOp = useEditor((s) => s.toggleOp);
  const removeOp = useEditor((s) => s.removeOp);
  const moveOp = useEditor((s) => s.moveOp);
  const clearStack = useEditor((s) => s.clearStack);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="stamp">Stack</div>
        {ops.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={clearStack}>
            Clear
          </button>
        )}
      </div>

      {ops.length === 0 ? (
        <p className="text-[11px] text-text-muted">
          Pick a tool. Edits stack in order and stay editable.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {ops.map((op, i) => (
            <li
              key={op.id}
              className={`tile flex items-center gap-1.5 px-2 py-1.5 text-[11px] ${
                op.id === activeOpId ? "border-accent" : ""
              }`}
            >
              <span className="w-3 shrink-0 text-text-muted">{i + 1}</span>
              <button
                type="button"
                className={`display flex-1 text-left ${op.enabled ? "" : "text-text-muted line-through"}`}
                onClick={() => setActiveOp(op.id)}
              >
                {metaFor(op.type).label}
              </button>
              <button
                type="button"
                title={op.enabled ? "Disable" : "Enable"}
                className="px-1 text-text-muted hover:text-accent"
                onClick={() => toggleOp(op.id)}
              >
                {op.enabled ? "◉" : "○"}
              </button>
              <button
                type="button"
                title="Move up"
                disabled={i === 0}
                className="px-1 text-text-muted hover:text-accent disabled:opacity-30"
                onClick={() => moveOp(op.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                disabled={i === ops.length - 1}
                className="px-1 text-text-muted hover:text-accent disabled:opacity-30"
                onClick={() => moveOp(op.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                title="Remove"
                className="px-1 text-text-muted hover:text-accent"
                onClick={() => removeOp(op.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
