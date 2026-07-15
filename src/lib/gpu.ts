let cached: Promise<boolean> | null = null;

/**
 * navigator.gpu existing is not enough — the adapter request itself fails on plenty
 * of machines, so ask for one. Background removal is ~0.6s with WebGPU and ~25s on
 * the WASM fallback, which is worth telling people before they start.
 */
export function hasWebGPU(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      try {
        const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        if (!gpu) return false;
        return Boolean(await gpu.requestAdapter());
      } catch {
        return false;
      }
    })();
  }
  return cached;
}
