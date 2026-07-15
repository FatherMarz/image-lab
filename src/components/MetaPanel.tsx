import { isWideGamut } from "@/lib/exif";
import { useEditor } from "@/stores/editorStore";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-4 justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

/**
 * Exporting strips EXIF for free (canvas re-encoding drops it), so this panel isn't
 * about the stripping — it's about showing what the file is carrying before it goes.
 * GPS coordinates in a photo someone is about to post is the case that matters.
 *
 * Rows are fixed-height and always present so a file with GPS and one without occupy
 * the same space.
 */
export default function MetaPanel() {
  const exif = useEditor((s) => s.exif);
  const source = useEditor((s) => s.source);

  const wide = isWideGamut(exif?.profile ?? null);

  return (
    <div className="tile p-3">
      <div className="stamp mb-2 h-4">Metadata</div>

      <dl className="flex flex-col gap-1 text-[10px]">
        <Row label="Camera" value={exif?.camera ?? "—"} />
        <Row
          label="Taken"
          value={exif?.date ? new Date(exif.date).toLocaleDateString() : "—"}
        />
        <Row label="Software" value={exif?.software ?? "—"} />
        <Row label="Tags" value={exif ? String(exif.count) : source ? "none" : "—"} />
      </dl>

      {/* One reserved line carries whichever warning applies, so a file with GPS and
          one without occupy the same height. */}
      <p className="mt-2 h-8 text-[10px] leading-tight text-accent">
        {exif?.gps
          ? `Contains GPS ${exif.gps.lat.toFixed(4)}, ${exif.gps.lon.toFixed(4)} — the exact spot. Export drops it.`
          : wide
            ? `${exif?.profile} profile — export converts to sRGB, colours may shift.`
            : exif
              ? "Export drops all metadata."
              : ""}
      </p>
    </div>
  );
}
