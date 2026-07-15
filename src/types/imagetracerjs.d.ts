// imagetracerjs ships no types. Only the one function we call is declared.
declare module "imagetracerjs" {
  interface TracerOptions {
    numberofcolors?: number;
    scale?: number;
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    strokewidth?: number;
  }
  const ImageTracer: {
    imagedataToSVG(data: ImageData, options?: TracerOptions): string;
  };
  export default ImageTracer;
}
