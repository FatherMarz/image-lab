// Regenerates the derived test fixture.
//
//   node scripts/make-fixtures.mjs
//
// photo.jpg, swatch.png and grey.png are committed as-is:
//   photo.jpg  — a real photo (person against a building); synthetic images are
//                useless for testing salient-object segmentation, which reads a
//                colour chart as one big object and correctly removes nothing.
//   swatch.png — exact planted hexes (#DC2626 / #2563EB / #FACC15 / #00B140 field /
//                #18181B circle) so colour picking and palette k-means can be
//                asserted exactly rather than approximately.
//   grey.png   — flat #808080 for tonal maths.
//
// photo-gps.jpg is derived here because it needs EXIF that no camera gave us.
import piexif from "piexifjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");

/** Decimal degrees to EXIF's rational degrees/minutes/seconds triple. */
const deg = (v) => {
  const d = Math.floor(v);
  const m = Math.floor((v - d) * 60);
  const s = Math.round(((v - d) * 60 - m) * 6000);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
};

const jpeg = fs.readFileSync(path.join(FIXTURES, "photo.jpg")).toString("binary");
const exif = {
  "0th": {
    [piexif.ImageIFD.Make]: "Canon",
    [piexif.ImageIFD.Model]: "EOS R5",
    [piexif.ImageIFD.Software]: "image-lab-fixture",
  },
  Exif: { [piexif.ExifIFD.DateTimeOriginal]: "2026:03:14 09:26:53" },
  GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: "N",
    [piexif.GPSIFD.GPSLatitude]: deg(53.5461),
    [piexif.GPSIFD.GPSLongitudeRef]: "W",
    [piexif.GPSIFD.GPSLongitude]: deg(113.4938),
  },
};

const out = piexif.insert(piexif.dump(exif), jpeg);
fs.writeFileSync(path.join(FIXTURES, "photo-gps.jpg"), Buffer.from(out, "binary"));
console.log("wrote photo-gps.jpg — GPS 53.5461 N, 113.4938 W + Canon EOS R5");
