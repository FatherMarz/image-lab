# image lab

A local image suite. Remove backgrounds, pull palettes, swap and delete colours, crop,
upscale and convert — entirely in your browser. Nothing is uploaded, because there is
no server to upload to.

Live at **[images.modul4r.com](https://images.modul4r.com)**. A [modul4r](https://modul4r.com) tool.

Replaces `bg-remover`, a local Flask app that needed Python and a `pip install` to do
one of these jobs.

## Develop

```bash
npm install
npm run dev            # http://localhost:5176
npm run build

npm run e2e            # pipeline: stack, params, toggle, compare, export
npm run e2e:bg         # background removal on the WASM path (~25s/cutout)
HEADED=1 npm run e2e:bg  # background removal on the WebGPU path (~0.6s/cutout)
```

## How it works

Every tool is an **op**: a pure `ImageData -> ImageData` transform in an ordered,
non-destructive stack. Nothing is baked until you export.

- All rendering happens in a **Web Worker** (`src/workers/pipeline.worker.ts`), so
  model inference never blocks the UI.
- The pipeline **caches each prefix**, so editing one op's params replays only the ops
  after it, not the whole chain. That's what keeps a slider live behind a slow cutout.
- Preview renders at 1600px; export re-runs the pipeline at full size. Geometry params
  are therefore normalized 0..1, and pixel-unit params scale via `OpContext.scale`.

Adding a tool is two files: metadata + controls in `src/lib/ops/registry.ts`, and an
`apply()` in `src/workers/ops/`.

## Background removal

Models are fetched from the Hugging Face CDN on first use and cached by the browser.
dtype is chosen by device — **fp16 on WebGPU (~0.6s), int8 on WASM (~25s)** — because
fp16 is a hard `std::bad_alloc` on the WASM backend.

| Subject | Model | Licence |
| --- | --- | --- |
| Anything | [`onnx-community/ISNet-ONNX`](https://huggingface.co/onnx-community/ISNet-ONNX) | AGPL-3.0 |
| People | [`onnx-community/ormbg-ONNX`](https://huggingface.co/onnx-community/ormbg-ONNX) | Apache-2.0 |

`probe.html` is a dev-only harness that measures which (model, dtype, device) combos
actually run. It exists because most of them don't, and the model cards don't say:

- **BiRefNet_lite** (MIT) — unusable. Exceeds WebGPU's per-shader storage-buffer limit
  (needs 11, Macs allow 10) *and* OOMs on WASM at every dtype.
- **BEN2** (MIT, 219MB) — never finishes loading.
- **U-2-Netp** (Apache-2.0, 4.6MB) — `model_type: "u2net"` isn't registered in
  transformers.js.
- **RMBG-1.4 / 2.0** — non-commercial and gated.
- **@imgly/background-removal** — AGPL-3.0 with a paid opt-out.

Re-run the probe when transformers.js or onnxruntime-web updates; these results will
move.

## Licence

**AGPL-3.0-only** — see [LICENSE](LICENSE).

Not a preference. ISNet is the only general-purpose background model that actually runs
in a browser, and it's published under AGPL-3.0. Everything permissive was either
portrait-only or wouldn't run at all. The alternative was a background remover that
only worked on photos of people.
