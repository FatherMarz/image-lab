import { useCallback, useRef, useState } from "react";
import { useEditor } from "@/stores/editorStore";

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif";

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
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="view w-full max-w-xl">
        <div className="stamp mb-3">
          <span className="live-dot" /> Local only
        </div>
        <h1 className="display mb-2 text-3xl">image lab</h1>
        <p className="mb-6 text-sm text-text-muted">
          Remove backgrounds, pull palettes, swap colours, crop and convert. Your image
          never leaves this browser — there is no server to send it to.
        </p>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`tile tile-interactive flex h-56 w-full flex-col items-center justify-center gap-2 ${
            over ? "border-accent bg-surface/85" : ""
          }`}
        >
          <span className="display text-sm">Drop an image</span>
          <span className="text-xs text-text-muted">or click to choose · PNG JPG WebP AVIF</span>
        </button>

        {error && <p className="mt-3 text-xs text-accent">{error}</p>}

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
