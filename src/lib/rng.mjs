// Seeded randomness. Every creative choice in the director flows through here,
// so the same prompt always yields the same video and a different prompt yields
// a genuinely different one.

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — small, fast, good enough for creative choices.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.float = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(next.float(lo, hi + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  // Weighted pick: items are [value, weight] pairs.
  next.weighted = (pairs) => {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let r = next() * total;
    for (const [v, w] of pairs) {
      if ((r -= w) <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  };
  return next;
}
