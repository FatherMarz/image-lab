import { useState } from "react";
import { contrastRatio, hexToRgb, rgbToHsl } from "@/lib/color";
import { useEditor } from "@/stores/editorStore";

function Copyable({
  label,
  value,
  enabled,
}: {
  label: string;
  value: string;
  enabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!enabled}
      className="tile tile-interactive flex h-6 w-full items-center justify-between px-2 text-left text-[10px]"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }}
    >
      <span className="text-text-muted">{label}</span>
      <span className="display truncate">{copied ? "copied" : value}</span>
    </button>
  );
}

/**
 * Always rendered, fixed height, with placeholder values before anything is picked.
 * Mounting this only once a colour existed made every panel below it jump down the
 * first time you clicked the image.
 */
export default function ColorPanel() {
  const picked = useEditor((s) => s.picked);

  const { r, g, b } = hexToRgb(picked ?? "#000000");
  const [h, s, l] = rgbToHsl(r, g, b);

  // Contrast against black and white tells you what text will survive on this colour,
  // which is the question you actually have when pulling a colour off an image.
  const onWhite = contrastRatio({ r, g, b }, { r: 255, g: 255, b: 255 });
  const onBlack = contrastRatio({ r, g, b }, { r: 0, g: 0, b: 0 });
  const grade = (v: number) => (v >= 4.5 ? "AA" : v >= 3 ? "AA·lg" : "fail");

  return (
    <div className="tile p-3">
      <div className="mb-2 flex h-6 items-center justify-between">
        <span className="stamp">Picked</span>
        <span
          className="h-5 w-8 border border-border"
          style={{ backgroundColor: picked ?? "transparent" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Copyable label="HEX" value={picked ?? "—"} enabled={Boolean(picked)} />
        <Copyable
          label="RGB"
          value={picked ? `rgb(${r}, ${g}, ${b})` : "—"}
          enabled={Boolean(picked)}
        />
        <Copyable
          label="HSL"
          value={picked ? `hsl(${h}, ${s}%, ${l}%)` : "—"}
          enabled={Boolean(picked)}
        />
      </div>

      <div className="mt-1.5 grid h-4 grid-cols-2 gap-2 text-[10px] text-text-muted">
        {/* "on white"/"on black" overran the half-column and truncated the grade — the
            one part of the row worth reading. The swatch above makes "white"/"black"
            self-evident. */}
        <span className="truncate">
          {picked ? (
            <>
              white{" "}
              <span className="display text-text">
                {onWhite.toFixed(1)} {grade(onWhite)}
              </span>
            </>
          ) : (
            "Click the image to pick"
          )}
        </span>
        <span className="truncate text-right">
          {picked ? (
            <>
              black{" "}
              <span className="display text-text">
                {onBlack.toFixed(1)} {grade(onBlack)}
              </span>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
