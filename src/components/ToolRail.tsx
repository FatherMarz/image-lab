import { OP_ORDER, metaFor } from "@/lib/ops/registry";
import type { OpGroup, OpMeta } from "@/lib/ops/types";
import { useEditor } from "@/stores/editorStore";

const GROUP_LABELS: Record<OpGroup, string> = {
  bg: "Background",
  color: "Colour",
  transform: "Transform",
  meta: "Meta",
};

const GROUP_ORDER: OpGroup[] = ["bg", "color", "transform", "meta"];

export default function ToolRail() {
  const ops = useEditor((s) => s.ops);
  const addOp = useEditor((s) => s.addOp);
  const activeOpId = useEditor((s) => s.activeOpId);

  const byGroup = new Map<OpGroup, OpMeta[]>();
  for (const type of OP_ORDER) {
    const meta = metaFor(type);
    const list = byGroup.get(meta.group) ?? [];
    list.push(meta);
    byGroup.set(meta.group, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => (
        <div key={group}>
          <div className="stamp mb-2">{GROUP_LABELS[group]}</div>
          <div className="flex flex-col gap-1">
            {byGroup.get(group)!.map((meta) => {
              const op = ops.find((o) => o.type === meta.type);
              const active = op && op.id === activeOpId;
              return (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => addOp(meta.type)}
                  title={meta.blurb}
                  className={`tile tile-interactive flex items-center gap-2 px-2.5 py-2 text-left text-xs ${
                    active ? "border-accent" : ""
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      op ? (op.enabled ? "bg-accent" : "bg-border") : "bg-transparent ring-1 ring-border"
                    }`}
                  />
                  <span className="display">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
