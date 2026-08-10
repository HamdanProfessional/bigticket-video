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

/**
 * Handheld imperfection.
 *
 * A perfectly eased tween is the single clearest "a machine made this" tell —
 * real operators drift, breathe, and never hold a line exactly. This sums a few
 * incommensurable sine waves (so the pattern never visibly repeats) into a slow
 * wander. It is a deterministic function of absolute time, NOT of shot
 * progress, so the drift carries across cuts the way a real hand would rather
 * than resetting on every edit.
 *
 * Amplitudes are deliberately tiny: a few pixels. Enough to feel alive,
 * not enough to read as a wobble.
 */
export function handheld(t, seed = 0) {
  const s = (seed % 97) * 0.113;
  // Frequencies chosen to be mutually irrational-ish: no common period.
  const a = Math.sin(t * 0.37 + s * 1.7);
  const b = Math.sin(t * 0.61 + s * 2.9);
  const c = Math.sin(t * 0.23 + s * 0.8);
  const d = Math.sin(t * 1.07 + s * 4.1);
  return {
    x: a * 0.62 + b * 0.28 + d * 0.10,   // -1..1
    y: c * 0.55 + b * 0.32 + d * 0.13,
    rot: a * 0.4 + c * 0.6,
    breath: b,                            // slow zoom pulse, like breathing
  };
}

