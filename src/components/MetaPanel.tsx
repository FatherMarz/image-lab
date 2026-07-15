import { isWideGamut } from "@/lib/exif";
import { useEditor } from "@/stores/editorStore";

/**
 * Exporting strips EXIF for free (canvas re-encoding drops it), so this panel isn't
 * about the stripping — it's about showing what the file is carrying before it goes.
 * GPS coordinates in a photo someone is about to post is the case that matters.
 */
export default function MetaPanel() {
  const exif = useEditor((s) => s.exif);
  const source = useEditor((s) => s.source);
  if (!source) return null;

  if (!exif) {
    return (
      <div className="tile p-3">
        <div className="stamp mb-2">Metadata</div>
        <p className="text-[11px] text-text-muted">No EXIF in this file.</p>
      </div>
    );
  }

  const wide = isWideGamut(exif.profile);

  return (
    <div className="tile p-3">
      <div className="stamp mb-2">Metadata</div>

      {exif.gps && (
        <p className="mb-2 text-[11px] text-accent">
          Contains GPS: {exif.gps.lat.toFixed(4)}, {exif.gps.lon.toFixed(4)} — the exact
          spot this was taken.
        </p>
      )}

      <dl className="flex flex-col gap-1 text-[10px]">
        {exif.camera && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Camera</dt>
            <dd className="truncate">{exif.camera}</dd>
          </div>
        )}
        {exif.date && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Taken</dt>
            <dd className="truncate">{new Date(exif.date).toLocaleDateString()}</dd>
          </div>
        )}
        {exif.software && (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Software</dt>
            <dd className="truncate">{exif.software}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">Tags</dt>
          <dd>{exif.count}</dd>
        </div>
      </dl>

      {wide && (
        <p className="mt-2 text-[10px] text-accent">
          {exif.profile} profile — exporting converts to sRGB, so colours may shift
          slightly.
        </p>
      )}

      <p className="mt-2 text-[10px] text-text-muted">
        Exporting drops all of this. Your download carries no metadata.
      </p>
    </div>
  );
}
