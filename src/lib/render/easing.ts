// PURE: CSS-style cubic-bezier easing. cubicBezier(0.25, 0.1, 0.25, 1) is CSS "ease".
import type { CubicBezier } from "@/lib/moods/types";

const NEWTON_ITERATIONS = 6;
const BISECT_ITERATIONS = 24;
const EPSILON = 1e-6;

/** Returns f(x) = y of the bezier curve through (0,0), (x1,y1), (x2,y2), (1,1). Allocates once, not per call. */
export function cubicBezier([x1, y1, x2, y2]: CubicBezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  /** Find the curve parameter t whose x equals `x`: Newton's method, with bisection as the safety net. */
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < EPSILON) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < EPSILON) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < BISECT_ITERATIONS; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < EPSILON) break;
      if (error > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveT(x));
  };
}
