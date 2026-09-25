import { useCallback, useRef, useState } from "react";
import { useEditor } from "@/stores/editorStore";

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif";

const GLOW = [
  { left: "8%", top: "-20%", size: "46vw", color: "#7c5cff", delay: "0s" },
  { left: "52%", top: "-25%", size: "40vw", color: "#2ec5ff", delay: "-7s" },
  { left: "30%", top: "0%", size: "34vw", color: "#35e0a1", delay: "-13s" },
  { left: "72%", top: "5%", size: "28vw", color: "#5b5bf0", delay: "-4s" },
];

export default function Dropzone() {
  const loadFile = useEditor((s) => s.loadFile);
  const error = useEditor((s) => s.error);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile],
  );

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {GLOW.map((g, i) => (
          <div
            key={i}
            className="aurora-blob"
            style={{ left: g.left, top: g.top, width: g.size, height: g.size, backgroundColor: g.color, animationDelay: g.delay }}
          />
        ))}
        <div className="grid-bg absolute inset-0" />
      </div>

      <div className="view relative w-full max-w-2xl text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-text-muted backdrop-blur">
          <span className="live-dot" /> Local only
        </div>
        <h1 className="display mb-4 text-4xl tracking-[-0.04em] sm:text-6xl">Image Lab</h1>
        <p className="mx-auto mb-9 max-w-xl text-balance text-[15px] text-text-muted sm:text-base">
          Remove backgrounds, pull palettes, swap colours, crop and convert. Your image
          never leaves this browser — there is no server to send it to.
        </p>

        <div className="tile p-2 text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`flex h-56 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-black transition-colors ${
              over ? "border-text bg-surface-alt" : "border-[#2e2e2e] hover:border-[#4a4a4a]"
            }`}
          >
            <span className="text-[15px] font-medium">Drop an image</span>
            <span className="text-xs text-text-muted">or click to choose · PNG JPG WebP AVIF</span>
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-[#ff6166]">{error}</p>}

        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
