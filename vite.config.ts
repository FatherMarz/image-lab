import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "node:path";

// wasm_vtracer ships wasm-bindgen's bundler target, which imports the .wasm as an ES
// module. Vite can't do that natively, and the generated glue starts the module at the
// top level — hence both plugins, in the worker too, which is where the tracing runs.
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  server: {
    port: 5176,
  },
});
