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
      <div className="mb-2 flex h-6 items-center justify-between">
        <div className="stamp">Stack</div>
        {ops.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={clearStack}>
            Clear
          </button>
        )}
      </div>

      {/* Fixed height, self-scrolling. This region is pinned above nothing — it steals
          its height from the tool controls — so the reserve has to be constant. A
          max-height still shrank the rail by a row per op until it hit the cap. */}
      <div className="h-32 overflow-y-auto">
      {ops.length === 0 ? (
        <p className="text-[11px] text-text-muted">
          Pick a tool. Edits stack in order and stay editable.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {ops.map((op, i) => {
            // A terminal op (Vectorize) is pinned last, so neither it nor its
            // neighbour can trade places with it. Disable rather than let the click
            // land on a store guard that silently does nothing.
            const pinned = Boolean(metaFor(op.type).terminal);
            const nextPinned = i + 1 < ops.length && metaFor(ops[i + 1].type).terminal;
            return (
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
                title={pinned ? "Vectorize stays last" : "Move up"}
                disabled={i === 0 || pinned}
                className="px-1 text-text-muted hover:text-accent disabled:opacity-30"
                onClick={() => moveOp(op.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                title={pinned || nextPinned ? "Vectorize stays last" : "Move down"}
                disabled={i === ops.length - 1 || pinned || nextPinned}
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
            );
          })}
        </ol>
      )}
      </div>
    </div>
  );
}
