// Background removal check. Downloads a real model on first run, so it uses a
// persistent profile — transformers.js caches weights in the Cache API, which lives in
// the profile dir and makes repeat runs fast.
//
//   npm run dev
//   npm run e2e:bg          # headless: exercises the WASM path (~25s per cutout)
//   HEADED=1 npm run e2e:bg # real Chrome: exercises the WebGPU path (~0.6s)
//
// Headless Chromium has no GPU adapter, so only the headed run covers WebGPU. Both
// paths ship, so both are worth running.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const BASE = process.env.E2E_BASE ?? "http://localhost:5176";
const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures");
const PROFILE = path.join(os.tmpdir(), "image-lab-e2e-profile");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

async function pixel(page, fx, fy) {
  return page.evaluate(
    ([fx, fy]) => {
      const c = document.querySelector("canvas");
      const cx = c.getContext("2d");
      const d = cx.getImageData(
        Math.floor(c.width * fx),
        Math.floor(c.height * fy),
        1,
        1,
      ).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [fx, fy],
  );
}

// Never pass WebGPU/Vulkan flags to headless — forcing them broke canvas creation
// outright. Use HEADED=1 with real Chrome to test the GPU path instead.
fs.mkdirSync(PROFILE, { recursive: true });
const ctx = await chromium.launchPersistentContext(
  PROFILE,
  process.env.HEADED ? { headless: false, channel: "chrome" } : {},
);
const page = ctx.pages()[0] ?? (await ctx.newPage());

const logs = [];
page.on("console", (m) => logs.push(m.text()));
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message}`);
  failures++;
});

await page.goto(BASE);
// A real photo, not the synthetic swatch: salient-object detection reads a
// four-quadrant colour chart as one big object and correctly removes nothing.
// photo.jpg is a person against a building — subject centre, backdrop at the corners.
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "photo.jpg"));
await page.waitForSelector("canvas");
await page.waitForTimeout(400);

const SUBJECT = [0.47, 0.62];
const BACKDROP = [0.06, 0.1];

const cornerBefore = await pixel(page, ...BACKDROP);
check("backdrop starts opaque", cornerBefore[3] === 255, `alpha ${cornerBefore[3]}`);

await page.click('button:has-text("Remove BG")');
console.log("  ..  waiting for model (first run downloads 44-88MB)");

// Wait for the render to settle rather than a fixed timeout.
await page
  .waitForFunction(
    (p) => {
      const c = document.querySelector("canvas");
      if (!c) return false;
      const cx = c.getContext("2d");
      const d = cx.getImageData(Math.floor(c.width * p[0]), Math.floor(c.height * p[1]), 1, 1).data;
      return d[3] < 200;
    },
    BACKDROP,
    { timeout: 300000 },
  )
  .catch(() => {});

const cornerAfter = await pixel(page, ...BACKDROP);
const subjectAfter = await pixel(page, ...SUBJECT);

check("backdrop becomes transparent", cornerAfter[3] < 60, `alpha ${cornerAfter[3]}`);
check("subject stays opaque", subjectAfter[3] > 200, `alpha ${subjectAfter[3]}`);

const backend = logs.find((l) => l.includes("[image-lab]"));
console.log(`  ..  ${backend ?? "no backend log"}`);

// Replace the backdrop and confirm it composites behind the cutout.
await page.click('button:has-text("Replace BG")');
await page.selectOption("select", { label: "Solid colour" });
await page.waitForTimeout(1500);
const replaced = await pixel(page, ...BACKDROP);
// Assert the exact default backdrop (#f4f1e8). A loose "is it bright" check would
// pass on the original photo's own pale sky and prove nothing.
check(
  "replace paints the exact backdrop colour behind the cutout",
  replaced[3] === 255 &&
    Math.abs(replaced[0] - 244) < 6 &&
    Math.abs(replaced[1] - 241) < 6 &&
    Math.abs(replaced[2] - 232) < 6,
  `rgba(${replaced}) — expected ~rgb(244,241,232)`,
);
const subjectAfterReplace = await pixel(page, ...SUBJECT);
check(
  "subject survives the backdrop replace",
  subjectAfterReplace[3] === 255 &&
    Math.abs(subjectAfterReplace[0] - subjectAfter[0]) < 12,
  `rgb(${subjectAfterReplace.slice(0, 3)}) vs rgb(${subjectAfter.slice(0, 3)})`,
);

await page.screenshot({ path: path.join(os.tmpdir(), "image-lab-bg.png") });
console.log(`  ..  screenshot ${path.join(os.tmpdir(), "image-lab-bg.png")}`);

await ctx.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
