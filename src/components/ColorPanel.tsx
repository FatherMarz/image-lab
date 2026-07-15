import { useState } from "react";
import { contrastRatio, hexToRgb, rgbToHsl } from "@/lib/color";
import { useEditor } from "@/stores/editorStore";

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tile tile-interactive flex w-full items-center justify-between px-2 py-1 text-left text-[10px]"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }}
    >
      <span className="text-text-muted">{label}</span>
      <span className="display">{copied ? "copied" : value}</span>
    </button>
  );
}

export default function ColorPanel() {
  const picked = useEditor((s) => s.picked);
  if (!picked) return null;

  const { r, g, b } = hexToRgb(picked);
  const [h, s, l] = rgbToHsl(r, g, b);

  // Contrast against black and white tells you what text will survive on this colour,
  // which is the question you actually have when pulling a colour off an image.
  const onWhite = contrastRatio({ r, g, b }, { r: 255, g: 255, b: 255 });
  const onBlack = contrastRatio({ r, g, b }, { r: 0, g: 0, b: 0 });
  const grade = (v: number) => (v >= 4.5 ? "AA" : v >= 3 ? "AA large" : "fail");

  return (
    <div className="tile rise p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="stamp">Picked</span>
        <span
          className="h-5 w-8 border border-border"
          style={{ backgroundColor: picked }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Copyable label="HEX" value={picked} />
        <Copyable label="RGB" value={`rgb(${r}, ${g}, ${b})`} />
        <Copyable label="HSL" value={`hsl(${h}, ${s}%, ${l}%)`} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-text-muted">
        <span>
          on white <span className="display text-text">{onWhite.toFixed(1)}</span>{" "}
          {grade(onWhite)}
        </span>
        <span>
          on black <span className="display text-text">{onBlack.toFixed(1)}</span>{" "}
          {grade(onBlack)}
        </span>
      </div>
    </div>
  );
}
