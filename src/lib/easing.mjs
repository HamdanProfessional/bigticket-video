// Easing curves. The choice of curve is what makes a move feel "warm and soft"
// versus mechanical, so the director treats it as a creative parameter.

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const EASINGS = {
  linear: (t) => t,
  // The workhorse for slow cinematic pushes.
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  // Long, luxurious settle — good for hero reveals.
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeIn: (t) => t * t * t,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Slight overshoot; used sparingly for playful prompts.
  backOut: (t) => {
    const c1 = 1.3, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // Settles like a real object with damping.
  springOut: (t) => {
    if (t === 0 || t === 1) return t;
    return 1 - Math.exp(-6 * t) * Math.cos(6.5 * t);
  },
  // Anticipation: pulls back slightly before moving.
  anticipate: (t) => (t < 0.25 ? -0.12 * Math.sin((t / 0.25) * Math.PI) : EASINGS.easeOutQuint((t - 0.25) / 0.75)),
};

export const ease = (name, t) => (EASINGS[name] || EASINGS.smooth)(clamp01(t));

export const lerp = (a, b, t) => a + (b - a) * t;

// Maps a time range onto 0..1 with an easing applied — the primitive every
// shot uses to drive a property over its own slice of the timeline.
export function tween(t, start, end, from, to, easing = 'smooth') {
  if (end <= start) return to;
  return lerp(from, to, ease(easing, (t - start) / (end - start)));
}

export { clamp01 };
