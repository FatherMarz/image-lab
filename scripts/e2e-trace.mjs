// The Vectorize tool: a terminal op with no worker implementation, tracing via VTracer
// (WASM) inside the pipeline worker. Asserts it traces, that Mode works, that line art
// isn't blank, that it stays pinned last, and that the rest of the app survives an op
// the worker can't run.
//   npm run dev            (in one shell)
//   npm run e2e:trace      (in another)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:5176";
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

/** Distinct RGB values on the preview canvas. Collapses hard when a photo is traced. */
async function uniqueColors(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] >= 8) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return seen.size;
  });
}

/**
 * Colours covering at least 1% of the canvas, and how much of it is dark.
 *
 * uniqueColors and flatFills move in OPPOSITE directions: tracing a photo cuts unique
 * colours (23k -> 3k) but RAISES flat fills (4 -> 16), because a photo spreads colour
 * so thin that almost nothing clears 1% while a trace concentrates area into big
 * regions. uniqueColors answers "did it trace"; flatFills answers "how many colours".
 * darkShare exists because a blank trace is indistinguishable from a clean one by
 * count alone — VTracer's binary mode emits fill="none" and renders invisible.
 */
async function stats(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const counts = new Map();
    let total = 0;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
      total++;
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (lum < 40) dark++;
      else if (lum > 215) light++;
    }
    return {
      flatFills: [...counts.values()].filter((n) => n / total >= 0.01).length,
      darkShare: dark / total,
      twoTone: (dark + light) / total,
    };
  });
}

const tool = (page, type) => page.click(`[data-tool="${type}"]`);

const stack = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("ol li")].map((li) => li.querySelector("button").textContent),
  );

async function setSlider(page, label, value) {
  await page.evaluate(
    ([label, value]) => {
      const row = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.includes(label),
      );
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
}

async function setSelect(page, label, value) {
  await page.evaluate(
    ([label, value]) => {
      const row = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.includes(label),
      );
      const el = row.querySelector("select");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [label, value],
  );
}

const clickText = (page, text) =>
  page.evaluate((t) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t).click();
  }, text);

const browser = await chromium.launch();
const page = await browser.newPage();
let pageErrors = 0;
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message.slice(0, 160)}`);
  pageErrors++;
  failures++;
});

await page.goto(BASE);
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "photo.jpg"));
await page.waitForSelector("canvas");
await page.waitForTimeout(600);

const raster = await uniqueColors(page);
check("photo renders untraced first", raster > 500, `${raster} colours`);

// --- the tool traces, via WASM, inside the worker ------------------------
await tool(page, "vectorize");
await page.waitForTimeout(6000);
// VTracer's colour mode is faithful by design, so a photo does NOT collapse to a
// handful of colours the way ImageTracer's 16-colour quantization did. The drop is real
// but modest; the sharp signals are the Colour-detail knob and line art, below.
const traced = await uniqueColors(page);
check("Vectorize traces the viewport", traced < raster * 0.8, `${raster} -> ${traced} colours`);

await setSlider(page, "Colour detail", 1);
await page.waitForTimeout(6000);
const coarse = await uniqueColors(page);
check("Colour detail drives the trace", coarse < traced / 2, `${traced} -> ${coarse} colours`);
await setSlider(page, "Colour detail", 6);
await page.waitForTimeout(6000);

// The export format is still PNG here — the tool traces on its own, with no help from
// the format picker.
const fmt = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .filter((b) => ["PNG", "JPG", "WebP", "SVG"].includes(b.textContent.trim()))
    .find((b) => b.className.includes("btn-primary"))?.textContent.trim(),
);
check("it traces without picking SVG", fmt === "PNG", `format is ${fmt}`);

// --- Mode: line art must be a silhouette, not a blank canvas -------------
// VTracer's binary mode emits every path as fill="none"; unpatched, this renders white
// on white and every count-based assertion still passes.
await setSelect(page, "Mode", "lineart");
await page.waitForTimeout(6000);
// Ink and paper only. Rasterizing antialiases the edges, so a few grey blends survive —
// but anything that isn't near-black or near-white means it didn't binarize.
const la = await stats(page);
check(
  "line art is two-tone",
  la.twoTone > 0.85,
  `${(la.twoTone * 100).toFixed(1)}% ink or paper`,
);
// Both directions matter: fill="none" rendered blank, and painting every path black
// rendered a solid rectangle. Each passes a naive count-based check.
check(
  "line art is a silhouette, not blank or solid",
  la.darkShare > 0.05 && la.darkShare < 0.9,
  `${(la.darkShare * 100).toFixed(1)}% dark`,
);

await setSelect(page, "Mode", "color");
await page.waitForTimeout(6000);

// --- terminal: pinned last ----------------------------------------------
await tool(page, "duotone");
await page.waitForTimeout(2500);
const order = await stack(page);
check(
  "a tool added after Vectorize lands before it",
  order[order.length - 1] === "Vectorize",
  order.join(" > "),
);

const arrows = await page.evaluate(() => {
  const li = [...document.querySelectorAll("ol li")].pop();
  const btn = (t) => [...li.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
  return { up: btn("↑").disabled, down: btn("↓").disabled };
});
check("Vectorize cannot be moved off the end", arrows.up && arrows.down);

// --- the worker survives an op it cannot run ----------------------------
// PipelineClient strips terminal ops; without that this throws in the worker, since
// there is no APPLY["vectorize"]. Palette hands the raw stack straight to the worker.
const errsBefore = pageErrors;
await clickText(page, "Extract palette");
await page.waitForTimeout(3000);
const swatches = await page.evaluate(
  () => document.querySelectorAll('[title^="#"], [data-swatch]').length,
);
check(
  "Palette extract survives Vectorize in the stack",
  pageErrors === errsBefore && swatches > 0,
  `${swatches} swatches`,
);

// --- export -------------------------------------------------------------
async function download(page, format) {
  await clickText(page, format);
  await page.waitForTimeout(600);
  const dl = page.waitForEvent("download");
  await clickText(page, "Download");
  const file = await dl;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { name: file.suggestedFilename(), body: Buffer.concat(chunks).toString("binary") };
}

const svg = await download(page, "SVG");
const paths = (svg.body.match(/<path/g) ?? []).length;
check("SVG export is real vector markup", svg.body.includes("<path") && svg.name.endsWith(".svg"));
check("SVG export carries fills, not fill=none", !svg.body.includes('fill="none"'));
// ImageTracer needed 3516 paths for this fixture. Guards against a regression to a
// raster-smeared-into-paths tracer.
check("SVG export is lean", paths < 2500, `${paths} paths`);

const png = await download(page, "PNG");
check(
  "PNG export of a traced image is a PNG",
  png.name.endsWith(".png") && png.body.slice(1, 4) === "PNG",
);
check("PNG export records Vectorize in the filename", png.name.includes("vectorize"), png.name);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
