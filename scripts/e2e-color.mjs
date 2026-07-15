// Colour suite check against swatch.png, whose hexes are exact by construction:
//   #DC2626 top-left, #2563EB top-right, #FACC15 bottom-left,
//   #00B140 bottom-right (green-screen field), #18181B centre circle.
//
//   npm run dev && npm run e2e:color
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

async function pixel(page, fx, fy) {
  return page.evaluate(
    ([fx, fy]) => {
      const c = document.querySelector("canvas");
      const d = c
        .getContext("2d")
        .getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [fx, fy],
  );
}

async function clickCanvas(page, fx, fy) {
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(200);
}

async function setRange(page, label, value) {
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
  await page.waitForTimeout(300);
}

const near = (a, b, tol = 6) => Math.abs(a - b) <= tol;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (e) => {
  console.log(`FAIL  pageerror — ${e.message}`);
  failures++;
});
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

await page.goto(BASE);
await page.setInputFiles('input[type="file"]', path.join(FIXTURES, "swatch.png"));
await page.waitForSelector("canvas");
await page.waitForTimeout(400);

// --- picker -------------------------------------------------------------
// The fixture's hexes are exact, so the readout must match exactly, not approximately.
await clickCanvas(page, 0.25, 0.25);
const body = await page.textContent("body");
check("picker reads the exact hex under the cursor", body.includes("#dc2626"), "expected #dc2626");
check("picker reports RGB", body.includes("rgb(220, 38, 38)"));
check("picker reports WCAG contrast", /on white/.test(body) && /on black/.test(body));

// --- palette ------------------------------------------------------------
await page.selectOption("select", "5").catch(() => {});
await page.click('button:has-text("Extract palette")');
await page.waitForSelector('button:has-text("Copy as Hex")', { timeout: 30000 });
const swatchTitles = await page.$$eval('div.tile button[title*="#"]', (els) =>
  els.map((e) => e.getAttribute("title")),
);
const found = swatchTitles.map((t) => t.split(" ")[0].toLowerCase());
// The four quadrants dominate the image, so they must survive clustering.
for (const expected of ["#dc2626", "#2563eb", "#facc15", "#00b140"]) {
  check(
    `palette contains ${expected}`,
    found.some((h) => {
      const a = parseInt(h.slice(1), 16);
      const b = parseInt(expected.slice(1), 16);
      return (
        Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) < 24 &&
        Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) < 24 &&
        Math.abs((a & 255) - (b & 255)) < 24
      );
    }),
    found.join(" "),
  );
}

// --- delete colour ------------------------------------------------------
// Sample the baseline BEFORE adding the op — otherwise "starts opaque" is measured
// against an image the op has already keyed, and the assertion is meaningless.
const greenBefore = await pixel(page, 0.75, 0.75);
check("green field starts opaque", greenBefore[3] === 255, `alpha ${greenBefore[3]}`);

await page.click('button:has-text("Delete Colour")');
await page.waitForTimeout(400);
const greenGone = await pixel(page, 0.75, 0.75);
check(
  "default key colour removes the green field",
  greenGone[3] < 40,
  `alpha ${greenGone[3]} (key #00b140 is the fixture's field)`,
);
const redKept = await pixel(page, 0.25, 0.25);
check("delete leaves other colours alone", redKept[3] === 255 && near(redKept[0], 220));

// --- swap colour --------------------------------------------------------
await page.click('button:has-text("Swap Colour")');
await page.waitForTimeout(400);
const swapped = await pixel(page, 0.25, 0.25);
check(
  "swap turns red into blue",
  swapped[2] > swapped[0] && swapped[2] > 120,
  `rgb(${swapped.slice(0, 3)}) — expected blue-dominant`,
);
const yellowUntouched = await pixel(page, 0.25, 0.75);
check(
  "swap leaves unmatched colours alone",
  near(yellowUntouched[0], 250, 10) && near(yellowUntouched[1], 204, 10),
  `rgb(${yellowUntouched.slice(0, 3)})`,
);

// Tolerance 0 should still match the exact source colour; widening must not break it.
await setRange(page, "Tolerance", 0);
const tightSwap = await pixel(page, 0.25, 0.25);
check(
  "tolerance 0 still swaps the exact source colour",
  tightSwap[2] > tightSwap[0],
  `rgb(${tightSwap.slice(0, 3)})`,
);

await browser.close();
console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
