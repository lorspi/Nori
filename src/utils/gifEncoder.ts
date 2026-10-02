import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface GifFrameOptions {
  delay: number; // in milliseconds
  transparent?: boolean;
}

export class GifEncoder {
  private width: number;
  private height: number;
  private loopCount: number;
  private gif: ReturnType<typeof GIFEncoder>;

  constructor(width: number, height: number, loopCount: number = 0) {
    this.width = width;
    this.height = height;
    this.loopCount = loopCount;
    this.gif = GIFEncoder();
  }

  /**
   * Add a single frame from Canvas ImageData
   */
  public addFrame(imageData: ImageData, options: GifFrameOptions) {
    const isTransparent = !!options.transparent;
    const rgba = imageData.data;

    let palette: number[][];
    let index: Uint8Array;
    let transparentIndex = -1;

    if (isTransparent) {
      palette = quantize(rgba, 256, {
        format: 'rgba4444',
        oneBitAlpha: true,
        clearAlpha: true,
      });
      index = applyPalette(rgba, palette, 'rgba4444');
      transparentIndex = palette.findIndex((p) => p[3] === 0);
    } else {
      palette = quantize(rgba, 256, { format: 'rgb565' });
      index = applyPalette(rgba, palette, 'rgb565');
    }

    this.gif.writeFrame(index, this.width, this.height, {
      palette,
      delay: Math.max(10, Math.round(options.delay)),
      repeat: this.loopCount === 0 ? 0 : this.loopCount > 0 ? this.loopCount : -1,
      transparent: isTransparent && transparentIndex !== -1,
      transparentIndex: transparentIndex !== -1 ? transparentIndex : 0,
      dispose: isTransparent ? 2 : -1,
    });
  }

  /**
   * Finalize the GIF file and return as Blob
   */
  public finish(): Blob {
    this.gif.finish();
    const bytes = this.gif.bytes();
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }
}
