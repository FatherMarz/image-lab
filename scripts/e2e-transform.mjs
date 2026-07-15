// Transform checks. The point of most of these is that the EXPORT (full resolution)
// matches what the preview (1600px) implied — that's where normalized-geometry and
// ctx.scale bugs surface, and a preview-only check would miss all of them.
//
//   npm run dev && npm run e2e:transform
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const BASE = process.env.E2E_BASE ?? "http://localhost:5176";
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "image-lab-tx-"));

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

/** PNG IHDR carries width/height at fixed offsets. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

async function exportPng(page) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click('button:has-text("Download")'),
  ]);
  const p = path.join(OUT, `${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(p);
  return p;
}

async function setRange(page, label, value) {
  await page.evaluate(
    ([label, value]) => {
      const row = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.includes(label),
      );
      const el = row.querySelector('input[type="range"]');
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set.call(el, String(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [label, value],
  );
  await page.waitForTimeout(400);
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
await page.waitForTimeout(400);

// --- rotate -------------------------------------------------------------
await page.click('[data-tool="orient"]');
await page.waitForTimeout(300);
await page.selectOption("select", "90");
await page.waitForTimeout(600);
let out = await exportPng(page);
let size = pngSize(out);
check("rotate 90 swaps dimensions", size.w === 300 && size.h === 400, `${size.w}x${size.h}`);
await page.click('li:has-text("Rotate + Flip") button[title="Remove"]');
await page.waitForTimeout(400);

// --- resize -------------------------------------------------------------
await page.click('[data-tool="resize"]');
await page.waitForTimeout(300);
await setRange(page, "Scale", 200);
out = await exportPng(page);
size = pngSize(out);
// 200% of 400x300 at FULL resolution. If the op read preview pixels this would be wrong.
check("resize 200% doubles the exported image", size.w === 800 && size.h === 600, `${size.w}x${size.h}`);

await setRange(page, "Scale", 50);
out = await exportPng(page);
size = pngSize(out);
check("resize 50% halves the exported image", size.w === 200 && size.h === 150, `${size.w}x${size.h}`);
await page.click('li:has-text("Resize + Upscale") button[title="Remove"]');
await page.waitForTimeout(400);

// --- crop ---------------------------------------------------------------
await page.click('[data-tool="crop"]');
await page.waitForTimeout(600);

// Selecting crop must bypass it so the full frame stays visible to drag on.
const previewDims = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return [c.width, c.height];
});
check(
  "crop preview shows the uncropped frame while selected",
  previewDims[0] / previewDims[1] > 1.3 && previewDims[0] / previewDims[1] < 1.35,
  `canvas ${previewDims[0]}x${previewDims[1]} (4:3 expected)`,
);

// Drag the left half of the image.
const box = await page.locator("canvas").boundingBox();
await page.mouse.move(box.x + box.width * 0.02, box.y + box.height * 0.02);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.98, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);

out = await exportPng(page);
size = pngSize(out);
// The drag covers ~48% of width and ~96% of height on a 400x300 source, so full-res
// output is ~192x288. Bounds are loose because the drag is pixel-approximate, but a
// preview/export scale bug would be off by multiples, not a few percent.
check(
  "crop exports at full resolution, not preview resolution",
  size.w > 150 && size.w < 230 && size.h > 250 && size.h <= 300,
  `${size.w}x${size.h} (expected ~192x288 from a left-half drag)`,
);

// --- stacking -----------------------------------------------------------
await page.click('[data-tool="resize"]');
await page.waitForTimeout(300);
await setRange(page, "Scale", 200);
out = await exportPng(page);
const stacked = pngSize(out);
check(
  "crop then resize compose",
  Math.abs(stacked.w - size.w * 2) <= 2 && Math.abs(stacked.h - size.h * 2) <= 2,
  `${stacked.w}x${stacked.h} from ${size.w}x${size.h}`,
);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
