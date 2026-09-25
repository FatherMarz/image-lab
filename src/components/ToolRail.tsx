import { OP_ORDER, metaFor } from "@/lib/ops/registry";
import type { OpGroup, OpMeta } from "@/lib/ops/types";
import { useEditor } from "@/stores/editorStore";

const GROUP_LABELS: Record<OpGroup, string> = {
  bg: "Background",
  color: "Colour",
  transform: "Transform",
  meta: "Meta",
  watermark: "Watermark Removal",
  output: "Output",
};

const GROUP_ORDER: OpGroup[] = ["bg", "color", "transform", "meta", "watermark", "output"];

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
          <div className="grid grid-cols-2 gap-0.5">
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
                  className={`flex h-9 min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors md:h-8 ${
                    active
                      ? "bg-surface-alt text-text shadow-[inset_0_0_0_1px_rgb(var(--line-strong))]"
                      : op
                        ? "text-text hover:bg-surface-alt"
                        : "text-text-muted hover:bg-surface-alt hover:text-text"
                  }`}
                >
                  {/* A dot only for tools already in the stack. Hollow rings on every
                      button read as unchecked radio buttons. */}
                  {op && (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${op.enabled ? "bg-accent" : "bg-faint"}`} />
                  )}
                  <span className="truncate">{meta.short ?? meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
