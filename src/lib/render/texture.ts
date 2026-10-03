// PURE: paper grain. The pixels depend only on (size, intensity, seed), so a scene always gets the same grain.

/** Small seeded PRNG (mulberry32). Same seed, same sequence, on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a), used to turn "Tender:reel" into a seed. */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Highest alpha a grain speck can reach at intensity 1 (0-255). Kept low: grain should be felt, not seen. */
const MAX_SPECK_ALPHA = 46;

/**
 * RGBA pixels of faint black and white specks. Intensity 0 gives a fully transparent image.
 * Drawn once per scene into an offscreen canvas, then stamped on every frame.
 */
export function grainPixels(width: number, height: number, intensity: number, seed: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const strength = Math.max(0, Math.min(1, intensity)) * MAX_SPECK_ALPHA;
  if (strength === 0) return pixels;

  const random = mulberry32(seed);
  for (let i = 0; i < pixels.length; i += 4) {
    const v = random();
    const light = v > 0.5 ? 255 : 0;
    pixels[i] = light;
    pixels[i + 1] = light;
    pixels[i + 2] = light;
    pixels[i + 3] = Math.abs(v - 0.5) * 2 * strength;
  }
  return pixels;
}
