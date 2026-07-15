// Batch + icon set. Asserts on the CONTENTS of the zip — that a download fired proves
// nothing about whether the files inside are right.
//
//   npm run dev && npm run e2e:batch
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const BASE = process.env.E2E_BASE ?? "http://localhost:5176";
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "image-lab-batch-"));

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

async function grabZip(page, trigger) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), trigger()]);
  const p = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(p);
  return unzipSync(new Uint8Array(fs.readFileSync(p)));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message}`);
  failures++;
});

await page.goto(BASE);
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "swatch.png"));
await page.waitForSelector("canvas");
await page.waitForTimeout(500);

// Put a real op on the stack so we can prove the batch applies it rather than just
// re-encoding the inputs.
await page.click('button:has-text("Rotate + Flip")');
await page.waitForTimeout(300);
await page.selectOption("select", "90");
await page.waitForTimeout(500);

// --- icon set -----------------------------------------------------------
let files = await grabZip(page, () => page.click('button:has-text("Icon set + manifest")'));
const names = Object.keys(files).sort();
check(
  "icon zip has every size plus a manifest",
  ["favicon-16.png", "favicon-32.png", "favicon-48.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.json"].every((n) => names.includes(n)),
  names.join(" "),
);
for (const [file, expect] of [["favicon-16.png", 16], ["apple-touch-icon.png", 180], ["icon-512.png", 512]]) {
  const s = pngSize(Buffer.from(files[file]));
  check(`${file} is exactly ${expect}x${expect}`, s.w === expect && s.h === expect, `${s.w}x${s.h}`);
}
const mf = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
check("manifest references the icons", mf.icons?.length === 2 && mf.icons[0].sizes === "192x192");

// --- batch --------------------------------------------------------------
files = await grabZip(page, async () => {
  await page.click('button:has-text("Run stack on files…")');
  await page.setInputFiles(
    'input[type="file"][multiple]',
    [path.join(FIXTURES, "swatch.png"), path.join(FIXTURES, "grey.png"), path.join(FIXTURES, "photo.jpg")],
  );
});
const batchNames = Object.keys(files).sort();
check("batch zip has one output per input", batchNames.length === 3, batchNames.join(" "));
check("batch keeps original filenames", batchNames.includes("swatch.png") && batchNames.includes("grey.png") && batchNames.includes("photo.png"));

// The stack has rotate-90, so a 400x300 input must come out 300x400. Same-size output
// would mean the batch re-encoded the file and silently skipped the stack.
const sw = pngSize(Buffer.from(files["swatch.png"]));
check("batch applies the stack, not just a re-encode", sw.w === 300 && sw.h === 400, `swatch ${sw.w}x${sw.h}, expected 300x400`);
const grey = pngSize(Buffer.from(files["grey.png"]));
check("batch rotates the square fixture too", grey.w === 200 && grey.h === 200, `${grey.w}x${grey.h}`);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
