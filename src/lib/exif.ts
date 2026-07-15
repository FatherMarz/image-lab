export type ExifSummary = {
  count: number;
  gps: { lat: number; lon: number } | null;
  camera: string | null;
  date: string | null;
  software: string | null;
  /** Non-sRGB profiles shift colour when the canvas re-encodes. */
  profile: string | null;
};

/**
 * Exporting always strips EXIF for free — canvas re-encoding drops it. So the value
 * here isn't the stripping, it's showing people what their file is carrying (GPS
 * coordinates, most of all) before it's gone.
 */
export async function readExif(file: File): Promise<ExifSummary | null> {
  try {
    const { default: exifr } = await import("exifr");
    // tiff:true already pulls IFD0, so it isn't listed separately.
    const all = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      icc: true,
    });
    if (!all) return null;

    const profile: string | null =
      all.ProfileDescription ?? all.ColorSpaceData ?? null;

    return {
      count: Object.keys(all).length,
      gps:
        typeof all.latitude === "number" && typeof all.longitude === "number"
          ? { lat: all.latitude, lon: all.longitude }
          : null,
      camera: [all.Make, all.Model].filter(Boolean).join(" ") || null,
      date: all.DateTimeOriginal ? String(all.DateTimeOriginal) : null,
      software: all.Software ?? null,
      profile,
    };
  } catch {
    // A file with no EXIF is the common case, not an error.
    return null;
  }
}

/** True for profiles that will visibly shift when flattened to sRGB on export. */
export function isWideGamut(profile: string | null): boolean {
  if (!profile) return false;
  return !/srgb/i.test(profile);
}
