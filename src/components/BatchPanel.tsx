import { useRef, useState } from "react";
import { runBatch } from "@/lib/batch";
import { download } from "@/lib/format";
import { buildIconSet } from "@/lib/icons";
import { useEditor } from "@/stores/editorStore";

export default function BatchPanel() {
  const ops = useEditor((s) => s.ops);
  const source = useEditor((s) => s.source);
  const format = useEditor((s) => s.exportFormat);
  const quality = useEditor((s) => s.exportQuality);
  const input = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList) {
    if (!files.length) return;
    setBusy(true);
    try {
      const { zip, failed } = await runBatch(
        [...files],
        ops,
        format,
        quality / 100,
        (done, total, name) => setStatus(`${done}/${total} · ${name}`),
      );
      download(zip, "image-lab-batch.zip");
      // Never silently drop files — say what didn't make it.
      setStatus(
        failed.length ? `Done. ${failed.length} failed: ${failed.join(", ")}` : "Done.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onIcons() {
    if (!source) return;
    setBusy(true);
    try {
      const zip = await buildIconSet(ops, source.name, (done, total) =>
        setStatus(`icon ${done}/${total}`),
      );
      download(zip, `${source.name}-icons.zip`);
      setStatus("Done.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tile p-3">
      <div className="stamp mb-2">Batch</div>
      <p className="mb-2 text-[10px] text-text-muted">
        Apply this exact stack to many images, or cut an icon set from this one.
      </p>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="btn btn-sm w-full"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Run stack on files…
        </button>
        <button type="button" className="btn btn-sm w-full" disabled={busy} onClick={onIcons}>
          Icon set + manifest
        </button>
      </div>

      {status && <p className="mt-2 text-[10px] text-accent">{status}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
