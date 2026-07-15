// End-to-end check of the edit-stack pipeline against a running dev server.
//   npm run dev            (in one shell)
//   node scripts/e2e.mjs   (in another)
// E2E_BASE overrides the target, so this runs against prod too.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const BASE = process.env.E2E_BASE ?? "http://localhost:5176";
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

/** Read a pixel from the preview canvas in image-space coords. */
async function pixel(page, fx, fy) {
  return page.evaluate(
    ([fx, fy]) => {
      const c = document.querySelector("canvas");
      const cx = c.getContext("2d");
      const x = Math.floor(c.width * fx);
      const y = Math.floor(c.height * fy);
      const d = cx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [fx, fy],
  );
}

/** React tracks input values, so a naive .value assignment is ignored. */
async function setRange(page, label, value) {
  await page.evaluate(
    ([label, value]) => {
      const rows = [...document.querySelectorAll("label")];
      const row = rows.find((l) => l.textContent.includes(label));
      const el = row.querySelector('input[type="range"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, String(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [label, value],
  );
  await page.waitForTimeout(250); // debounce (60ms) + worker round trip
}

const near = (a, b, tol = 6) => Math.abs(a - b) <= tol;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message}`);
  failures++;
});

await page.goto(BASE);

// --- load ---------------------------------------------------------------
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "swatch.png"));
await page.waitForSelector("canvas");
await page.waitForTimeout(400);

const dimText = await page.textContent("body");
check("source dimensions shown", dimText.includes("400×300"));

const topLeft = await pixel(page, 0.25, 0.25);
check("loads unmodified pixels", near(topLeft[0], 220) && near(topLeft[1], 38) && near(topLeft[2], 38), `got rgb(${topLeft.slice(0, 3)})`);

// --- stack: add an op ---------------------------------------------------
await page.click('button[title*="Brightness"], button:has-text("Adjust")');
await page.waitForTimeout(300);
check("op appears in stack", (await page.textContent("ol")).includes("Adjust"));

// --- params drive the pipeline ------------------------------------------
// Measured at the dark centre circle (#18181B): +40 brightness lands mid-range
// instead of clipping to white, so the assertion tests the maths, not the clamp.
const circleBefore = await pixel(page, 0.5, 0.5);
check("circle starts dark", near(circleBefore[0], 24), `rgb(${circleBefore.slice(0, 3)})`);

await setRange(page, "Brightness", 40);
const brightened = await pixel(page, 0.5, 0.5);
check(
  "brightness +40 adds ~102 without clipping",
  near(brightened[0], 24 + 102, 8) && brightened[0] < 255,
  `rgb(${circleBefore.slice(0, 3)}) -> rgb(${brightened.slice(0, 3)})`,
);
await setRange(page, "Brightness", 0);

// Saturation is tested on the untouched red quadrant. Testing it on an already
// white/clipped pixel would pass trivially — white is already grey.
await setRange(page, "Saturation", -100);
const desaturated = await pixel(page, 0.25, 0.25);
const expectedLuma = 0.2126 * 220 + 0.7152 * 38 + 0.0722 * 38; // ~76.7
check(
  "saturation -100 collapses red to its luma grey",
  near(desaturated[0], desaturated[1], 3) &&
    near(desaturated[1], desaturated[2], 3) &&
    near(desaturated[0], expectedLuma, 8),
  `rgb(${desaturated.slice(0, 3)}), expected ~${expectedLuma.toFixed(0)} grey`,
);
await setRange(page, "Saturation", 0);
await setRange(page, "Brightness", 40); // leave one live op for the export check

// --- toggle restores ----------------------------------------------------
await page.click('button[title="Disable"]');
await page.waitForTimeout(300);
const toggledOff = await pixel(page, 0.25, 0.25);
check(
  "disabling the op restores the original",
  near(toggledOff[0], topLeft[0]) && near(toggledOff[1], topLeft[1]),
  `rgb(${toggledOff.slice(0, 3)})`,
);

await page.click('button[title="Enable"]');
await page.waitForTimeout(300);

// --- compare slider -----------------------------------------------------
await page.click('button:has-text("Compare")');
await page.waitForTimeout(300);
const box = await page.locator("canvas").boundingBox();
await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
await page.mouse.up();
await page.waitForTimeout(300);
const leftOfSplit = await pixel(page, 0.25, 0.25);
check(
  "compare shows the original left of the divider",
  near(leftOfSplit[0], topLeft[0]) && near(leftOfSplit[1], topLeft[1]),
  `rgb(${leftOfSplit.slice(0, 3)})`,
);
await page.click('button:has-text("Comparing")');

// --- export -------------------------------------------------------------
const out = fs.mkdtempSync(path.join(os.tmpdir(), "image-lab-e2e-"));
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 20000 }),
  page.click('button:has-text("Download")'),
]);
const saved = path.join(out, download.suggestedFilename());
await download.saveAs(saved);
const size = fs.statSync(saved).size;
check("export downloads a file", size > 0, `${download.suggestedFilename()} ${size}B`);
check("export filename records the stack", download.suggestedFilename().includes("adjust"));

// Full-res export must match the source dimensions, not the 1600px preview.
const png = fs.readFileSync(saved);
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
check("export is full resolution", w === 400 && h === 300, `${w}x${h}`);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
