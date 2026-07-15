// Layout stability: nothing may move when you interact.
//
//   npm run dev && npm run e2e:layout
//
// Measures the on-screen box of each panel, performs the interactions that used to
// shift things (picking a colour, extracting a palette, switching tools, changing
// export format), and asserts the boxes are identical. Eyeballing this misses drift.
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

/** Box of each landmark panel, keyed by its stamp heading. */
async function layout(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll(".tile")) {
      const stamp = el.querySelector(".stamp");
      if (!stamp) continue;
      const r = el.getBoundingClientRect();
      out[stamp.textContent.trim()] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    const dl = [...document.querySelectorAll("button")].find((b) => /Download/.test(b.textContent));
    if (dl) {
      const r = dl.getBoundingClientRect();
      out["__download"] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    return out;
  });
}

function diff(a, b) {
  const moved = [];
  for (const k of Object.keys(a)) {
    if (!b[k]) continue;
    if (a[k].join() !== b[k].join()) moved.push(`${k}: [${a[k]}] -> [${b[k]}]`);
  }
  return moved;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message}`);
  failures++;
});

await page.goto(BASE);
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "photo-gps.jpg"));
await page.waitForSelector("canvas");
await page.waitForTimeout(800);

const base = await layout(page);
check("panels present before any interaction", Object.keys(base).length >= 4, Object.keys(base).join(" "));

// 1. Pick a colour — this used to mount the Picked panel and shove everything down.
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(400);
let moved = diff(base, await layout(page));
check("picking a colour moves nothing", moved.length === 0, moved.join(" | "));

// 2. Extract a palette — this used to grow the panel by a strip + two button rows.
await page.click('button:has-text("Extract palette")');
await page.waitForSelector('button:has-text("Re-extract")', { timeout: 30000 });
await page.waitForTimeout(400);
moved = diff(base, await layout(page));
check("extracting a palette moves nothing", moved.length === 0, moved.join(" | "));

// 3. Switch export format — the quality slider and warnings used to appear/vanish,
//    which walked the Download button around under the cursor.
const dlBefore = (await layout(page))["__download"];
for (const f of ["JPG", "SVG", "WebP", "PNG"]) {
  await page.click(`button:has-text("${f}")`);
  await page.waitForTimeout(250);
  const dl = (await layout(page))["__download"];
  check(`Download button holds still on ${f}`, dl.join() === dlBefore.join(), `[${dlBefore}] -> [${dl}]`);
}

// 4. Switch tools — OpControls swaps per tool; the rails must not move.
const railBefore = await layout(page);
for (const t of ["bg-remove", "duotone", "crop", "adjust"]) {
  await page.click(`[data-tool="${t}"]`);
  await page.waitForTimeout(350);
}
moved = diff(railBefore, await layout(page)).filter((m) => !/^(Palette|Picked|Metadata)/.test(m));
check("switching tools does not move the rails", moved.length === 0, moved.join(" | "));

// 5. Palette swatches must be equal width.
const widths = await page.$$eval('div[style*="grid-template-columns"] > *', (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().width)),
);
const uniform = widths.length > 0 && Math.max(...widths) - Math.min(...widths) <= 1;
check("palette swatches are equal width", uniform, widths.join(" "));

// 6. A pinned region must never clip its own contents. Scrolling regions may run past
//    the fold — that's what scrolling is — but anything pinned is claiming it fits,
//    and a pinned section slicing a tile through the middle is a broken promise.
const clipped = await page.evaluate(() => {
  const bad = [];
  for (const pin of document.querySelectorAll("aside .shrink-0")) {
    if (pin.scrollHeight > pin.clientHeight + 1) {
      bad.push(`pinned region: content ${pin.scrollHeight} > ${pin.clientHeight}`);
    }
  }
  return bad;
});
check("pinned regions never clip their contents", clipped.length === 0, clipped.join(" | "));

// 7. The working loop — pick a colour, pull a palette, export — must be fully visible
//    without scrolling at laptop height. Metadata and Batch are allowed below the fold;
//    the Download button is not.
const fold = await page.evaluate(() => {
  const want = ["Picked", "Palette", "Export"];
  const bad = [];
  for (const el of document.querySelectorAll(".tile")) {
    const stamp = el.querySelector(".stamp")?.textContent.trim();
    if (!want.includes(stamp)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight + 1) bad.push(`${stamp} bottom ${Math.round(r.bottom)} > ${window.innerHeight}`);
  }
  const dl = [...document.querySelectorAll("button")].find((b) => /Download/.test(b.textContent));
  const dr = dl.getBoundingClientRect();
  if (dr.bottom > window.innerHeight + 1) bad.push(`Download bottom ${Math.round(dr.bottom)}`);
  return bad;
});
check("pick/palette/export are above the fold at 900px", fold.length === 0, fold.join(" | "));

// 8. Tool labels must not truncate. Two columns halved the rail's height but cut the
//    labels to "Colourblin…" and "Resize + U…", which is a worse problem than the one
//    it solved. The `short` names exist to fit; assert they actually do.
const cut = await page.$$eval("aside button .display", (els) =>
  els
    .filter((e) => e.scrollWidth > e.clientWidth + 1)
    .map((e) => `${e.textContent.trim()} (${e.scrollWidth} > ${e.clientWidth})`),
);
check("no tool label is truncated", cut.length === 0, cut.join(" | "));

// 9. The stack is pinned, so it must be bounded. Uncapped, it grew a row per op until
//    it had eaten the rail and the tool controls above it were a clipped sliver.
const railRoom = async () =>
  page.evaluate(() => {
    const inner = document.querySelectorAll("aside")[0].querySelector(".overflow-y-auto");
    return inner.clientHeight;
  });
const roomBefore = await railRoom();
for (const t of ["dither", "colorblind", "orient", "redact", "frame"]) {
  await page.click(`[data-tool="${t}"]`);
  await page.waitForTimeout(150);
}
const roomAfter = await railRoom();
check(
  "piling ops on does not squeeze the tool rail",
  roomAfter === roomBefore,
  `room ${roomBefore} -> ${roomAfter}`,
);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
