/** Side images ops reference by id — currently just replacement backdrops. */
const assets = new Map<string, ImageBitmap>();

export function setAsset(id: string, bitmap: ImageBitmap) {
  assets.get(id)?.close();
  assets.set(id, bitmap);
}

export function getAsset(id: string): ImageBitmap | undefined {
  return assets.get(id);
}
