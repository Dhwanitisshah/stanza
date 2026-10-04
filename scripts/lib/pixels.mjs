// Pixel comparison for the export check. Self-contained on purpose: `comparePixels.toString()` is injected into the
// browser page (which compares a decoded video frame with the preview canvas), and the same function is unit-tested in Node.

/**
 * Compares two RGBA pixel arrays of equal length. Alpha is ignored (a video has none).
 * Returns the mean absolute difference per colour channel (0..255) and the PSNR in dB, capped at 99 for identical images.
 */
export function comparePixels(a, b) {
  if (a.length !== b.length) throw new Error("The two images are not the same size.");
  let sumAbs = 0;
  let sumSquares = 0;
  let count = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const difference = a[i + channel] - b[i + channel];
      sumAbs += Math.abs(difference);
      sumSquares += difference * difference;
      count++;
    }
  }
  const mad = sumAbs / count;
  const mse = sumSquares / count;
  return { mad, mse, psnr: mse === 0 ? 99 : Math.min(99, 10 * Math.log10((255 * 255) / mse)) };
}
