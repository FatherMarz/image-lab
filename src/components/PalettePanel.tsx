import { useState } from "react";
import { PREVIEW_MAX } from "@/lib/consts";
import { pipeline } from "@/lib/pipeline";
import { useEditor } from "@/stores/editorStore";

type Swatch = { hex: string; share: number };
type Format = "hex" | "css" | "tailwind" | "json";

const FORMATS: { id: Format; label: string }[] = [
  { id: "hex", label: "Hex" },
  { id: "css", label: "CSS" },
  { id: "tailwind", label: "Tailwind" },
  { id: "json", label: "JSON" },
];

function serialize(swatches: Swatch[], format: Format): string {
  const names = swatches.map((_, i) => `color-${i + 1}`);
  switch (format) {
    case "hex":
      return swatches.map((s) => s.hex).join("\n");
    case "css":
      return `:root {\n${swatches.map((s, i) => `  --${names[i]}: ${s.hex};`).join("\n")}\n}`;
    case "tailwind":
      return `colors: {\n${swatches
        .map((s, i) => `  "${names[i]}": "${s.hex}",`)
        .join("\n")}\n}`;
    case "json":
      return JSON.stringify(
        swatches.map((s) => ({ hex: s.hex, share: +s.share.toFixed(4) })),
        null,
        2,
      );
  }
}

export default function PalettePanel() {
  const ops = useEditor((s) => s.ops);
  const source = useEditor((s) => s.source);
  const pickColor = useEditor((s) => s.pickColor);

  const [swatches, setSwatches] = useState<Swatch[] | null>(null);
  const [count, setCount] = useState(6);
  const [format, setFormat] = useState<Format>("hex");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function extract() {
    if (!source) return;
    setBusy(true);
    try {
      // Runs against the current stack output, so a palette pulled after a duotone
      // reflects what you're actually looking at.
      const res = await pipeline.palette(ops, PREVIEW_MAX, count);
      setSwatches(res.swatches);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tile p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="stamp">Palette</span>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="border border-border bg-surface px-1 py-0.5 text-[10px] text-text"
        >
          {[3, 4, 5, 6, 8, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <button type="button" className="btn btn-sm w-full" onClick={extract} disabled={busy}>
        {busy ? "Reading…" : swatches ? "Re-extract" : "Extract palette"}
      </button>

      {swatches && swatches.length > 0 && (
        <>
          <div className="mt-2 flex h-8 w-full overflow-hidden border border-border">
            {swatches.map((s) => (
              <button
                key={s.hex}
                type="button"
                title={`${s.hex} · ${(s.share * 100).toFixed(0)}%`}
                onClick={() => pickColor(s.hex)}
                style={{ backgroundColor: s.hex, flexGrow: s.share }}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`btn btn-sm ${format === f.id ? "btn-primary" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-sm mt-1 w-full"
            onClick={() => {
              navigator.clipboard.writeText(serialize(swatches, format));
              setCopied(true);
              setTimeout(() => setCopied(false), 900);
            }}
          >
            {copied ? "Copied" : `Copy as ${FORMATS.find((f) => f.id === format)!.label}`}
          </button>
        </>
      )}
    </div>
  );
}
