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
          {/* Two columns: 14 short labels stacked single-file made the rail 654px tall,
              which left no room for the selected tool's controls below it. */}
          <div className="grid grid-cols-2 gap-1">
            {byGroup.get(group)!.map((meta) => {
              const op = ops.find((o) => o.type === meta.type);
              const active = op && op.id === activeOpId;
              return (
                <button
                  key={meta.type}
                  type="button"
                  // Stable hook for the e2e suites. Selecting tools by their label tied
                  // every test to UI copy, so renaming a button broke five suites.
                  data-tool={meta.type}
                  onClick={() => addOp(meta.type)}
                  title={meta.blurb}
                  className={`tile tile-interactive flex h-8 min-w-0 items-center gap-1.5 px-2 text-left text-[11px] ${
                    active ? "border-accent" : ""
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      op ? (op.enabled ? "bg-accent" : "bg-border") : "bg-transparent ring-1 ring-border"
                    }`}
                  />
                  <span className="display truncate">{meta.short ?? meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
