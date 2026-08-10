// The director: prompt -> storyboard.
//
// Everything creative is decided here and nowhere else, so the same prompt is
// reproducible and two different prompts produce genuinely different films:
// different beat order, different motion kinds, different pacing, different
// easing, different transitions, and a different musical key/tempo.

import { hashString, makeRng } from './lib/rng.mjs';
import { COMPONENTS, AFFINITY } from './shotlib.mjs';

// ------------------------------------------------------------------ moods
const MOODS = {
  calm: {
    match: /\b(calm|warm|soft|gentle|cosy|cozy|slow|gentle|relax|gentl|serene|gentle)\b/i,
    shotDur: [3.6, 5.2],
    easings: ['smoother', 'easeOutQuint', 'smooth'],
    kindBias: { slideIn: 1.8, hold: 2.2, driftDiagonal: 2.2, pushIn: 2, pullBack: 1.6, rackFocus: 1.4, whipTo: 0.15, panAcross: 1.2, tiltReveal: 1.2, spotlight: 1.9, cursorClick: 1 },
    letterbox: 1,
    vignette: 0.34,
    transition: ['dissolve', 'dissolve', 'softWipe'],
    music: { tempo: 62, key: 'F', scale: 'majorSeventh', warmth: 0.92, density: 0.35 },
  },
  premium: {
    match: /\b(premium|luxury|elegant|refined|sophisticat|high[- ]end|cinematic|classy)\b/i,
    shotDur: [3.2, 4.6],
    easings: ['easeOutQuint', 'smoother', 'anticipate'],
    kindBias: { slideIn: 1.6, pushIn: 2.2, pullBack: 2, rackFocus: 2, spotlight: 2.2, driftDiagonal: 1.5, hold: 1.2, whipTo: 0.4, panAcross: 1, tiltReveal: 1, cursorClick: 1 },
    letterbox: 1,
    vignette: 0.42,
    transition: ['dissolve', 'softWipe', 'flash'],
    music: { tempo: 70, key: 'D', scale: 'minorNinth', warmth: 0.85, density: 0.45 },
  },
  energetic: {
    match: /\b(energetic|fast|punchy|snappy|upbeat|dynamic|bold|hype|exciting)\b/i,
    shotDur: [1.9, 3.0],
    easings: ['easeOutQuint', 'backOut', 'springOut'],
    kindBias: { slideIn: 2.2, whipTo: 2.4, cursorClick: 2, spotlight: 1.8, pushIn: 1.6, panAcross: 1.4, tiltReveal: 1.2, pullBack: 1, rackFocus: 0.8, hold: 0.3, driftDiagonal: 0.6 },
    letterbox: 0.35,
    vignette: 0.2,
    transition: ['flash', 'wipe', 'dissolve'],
    music: { tempo: 104, key: 'A', scale: 'majorPent', warmth: 0.6, density: 0.8 },
  },
  playful: {
    match: /\b(playful|fun|friendly|quirky|light|cheerful|happy|bright)\b/i,
    shotDur: [2.3, 3.4],
    easings: ['backOut', 'springOut', 'easeOutQuint'],
    kindBias: { slideIn: 2.2, spotlight: 2, cursorClick: 2, whipTo: 1.4, panAcross: 1.6, pushIn: 1.4, tiltReveal: 1.2, pullBack: 1, hold: 0.6, rackFocus: 0.8, driftDiagonal: 1 },
    letterbox: 0.2,
    vignette: 0.18,
    transition: ['wipe', 'flash', 'dissolve'],
    music: { tempo: 92, key: 'C', scale: 'majorPent', warmth: 0.75, density: 0.65 },
  },
};
const DEFAULT_MOOD = 'calm';

// ---------------------------------------------------------------- formats
//
// Capture size is dictated by the site's own breakpoints, not by the delivery
// size. Landscape must stay above Tailwind's 1280px `xl` or the feature blocks
// are display:none; portrait must sit in the mobile layout. deviceScaleFactor
// makes up the difference so the encoder never has to upscale.
export const FORMATS = {
  landscape: {
    // 1x capture: removing will-change already re-rasterises per frame for
    // sharpness, and going above 1x on top of that halves throughput again for
    // very little visible gain.
    width: 1440, height: 810, deviceScaleFactor: 1,
    outWidth: 1280, outHeight: 720,
    portrait: false, mobile: false,
  },
  // 9:16 for Reels / TikTok / Stories. 540×960 CSS at 2x lands exactly on
  // 1080×1920, so there is no rescale at all.
  vertical: {
    width: 540, height: 960, deviceScaleFactor: 2,
    outWidth: 1080, outHeight: 1920,
    portrait: true, mobile: true,
  },
  // 4:5 feed post — the same mobile layout, less aggressive crop.
  square: {
    width: 540, height: 675, deviceScaleFactor: 2,
    outWidth: 1080, outHeight: 1350,
    portrait: true, mobile: true,
  },
};

const FORMAT_ALIASES = {
  desktop: 'landscape', web: 'landscape', wide: 'landscape', '16:9': 'landscape',
  mobile: 'vertical', phone: 'vertical', reel: 'vertical', story: 'vertical', '9:16': 'vertical',
  feed: 'square', post: 'square', '4:5': 'square',
};

// ----------------------------------------------------------------- topics
// Prompt keywords that pull specific components into the reel.
// Stems rather than whole words: "boards", "comparing" and "saved" all need to
// hit. Order matters only in that every match contributes.
const TOPICS = [
  { match: /\b(board|sav(e|es|ed|ing)|favou?rite|organi[sz]|collect|shortlist|wishlist)/i, comps: ['boards', 'cardSave'] },
  { match: /\b(compar|spec|side[- ]by[- ]side|decid|decision)/i, comps: ['compare', 'cardCompare'] },
  { match: /\b(price|pricing|deal|cheap|discount|track|drop|cost)/i, comps: ['pdp'] },
  { match: /\b(extension|chrome|browser|install|add[- ]?on|plugin)/i, comps: ['cardInstall', 'heroCta'] },
  { match: /\b(store|retail|amazon|walmart|target|shop|site|merchant)/i, comps: ['retailers'] },
  { match: /\b(how it works|onboard|tutorial|walkthrough|guide|step)/i, comps: ['howItWorks', 'cardInstall', 'cardSave', 'cardCompare'] },
];

// Components worth returning to when a reel needs more beats than the prompt
// named. Ordered by how well they carry a shot on their own.
const FILLER = ['boards', 'compare', 'pdp', 'retailers', 'cardInstall', 'cardSave', 'cardCompare', 'howItWorks', 'hero'];

// The default narrative spine when the prompt doesn't demand otherwise.
//
// Ad, not explainer: hook, one or two product moments, then the click. Marching
// through every feature card reads as a tutorial. The how-it-works cards are
// still available — they just have to be asked for (see TOPICS).
const HOOK = {
  kicker: 'Big Ticket',
  title: 'Buy once. Buy well.',
  subtitle: 'The browser extension for things worth getting right.',
};

const SIGNOFF = {
  kicker: 'Free on Chrome',
  title: 'Built for better decisions.',
  subtitle: 'Add Big Ticket and shop with confidence.',
};

const SPINE = ['hero', 'boards', 'compare', 'heroCta', 'finalCta'];

function detectMood(prompt, rng) {
  for (const [name, m] of Object.entries(MOODS)) if (m.match.test(prompt)) return name;
  // Nothing explicit: lean warm, but let the seed break the tie occasionally.
  return rng.weighted([[DEFAULT_MOOD, 6], ['premium', 3], ['playful', 1]]);
}

function detectFormat(prompt) {
  if (/\b(vertical|reel|reels|tiktok|stor(y|ies)|mobile|phone|portrait|9:16)\b/i.test(prompt)) return 'vertical';
  if (/\b(square|feed post|4:5|instagram post)\b/i.test(prompt)) return 'square';
  return 'landscape';
}

function detectDuration(prompt) {
  const m = prompt.match(/(\d+)\s*(s|sec|second|seconds)\b/i);
  if (m) return Math.max(8, Math.min(120, +m[1]));
  if (/\b(short|teaser|quick|bumper)\b/i.test(prompt)) return 12;
  if (/\b(long|full|deep|detailed|explainer|tutorial|walkthrough)\b/i.test(prompt)) return 45;
  // Long enough to actually say something. A 15s cut names one feature and
  // stops, which reads as a teaser rather than an ad; cards plus three product
  // beats need roughly this much room.
  return 30;
}

export function direct(prompt, opts = {}) {
  const seed = opts.seed != null ? opts.seed >>> 0 : hashString(prompt);
  const rng = makeRng(seed);
  const moodName = opts.mood || detectMood(prompt, rng);
  const mood = MOODS[moodName];
  const targetDur = opts.duration || detectDuration(prompt);

  // Site profile — overridable so this module is reusable against another
  // site without editing it. Defaults to the Big Ticket profile.
  const COMPS = opts.components || COMPONENTS;
  const AFF = opts.affinity || AFFINITY;
  const TOPIC_LIST = opts.topics || TOPICS;
  const SPINE_LIST = opts.spine || SPINE;
  const FILLER_LIST = (opts.filler || FILLER).filter((c) => COMPS[c]);

  const requested = (opts.format || '').toLowerCase();
  const fmtName =
    FORMATS[requested] ? requested
    : FORMAT_ALIASES[requested] ? FORMAT_ALIASES[requested]
    : detectFormat(prompt);
  const fmt = FORMATS[fmtName];

  // --- pick the cast of components -------------------------------------
  const wanted = new Set();
  for (const t of TOPIC_LIST) if (t.match.test(prompt)) t.comps.forEach((c) => wanted.add(c));

  let cast;
  if (wanted.size) {
    // Prompt-led: requested components first, spine fills the gaps so the film
    // still opens and closes properly.
    const requested = SPINE_LIST.filter((c) => wanted.has(c)).concat([...wanted].filter((c) => !SPINE_LIST.includes(c)));
    cast = ['hero', ...requested.filter((c) => c !== 'hero' && c !== 'finalCta'), 'finalCta'];
  } else {
    cast = [...SPINE_LIST];
    // Seeded variation on the default spine: drop a middle beat, maybe reorder.
    if (rng.chance(0.5)) {
      const droppable = cast.slice(2, -1);
      const drop = rng.pick(droppable);
      cast = cast.filter((c) => c !== drop);
    }
    if (rng.chance(0.35)) {
      const mid = cast.slice(1, -1);
      const swapped = rng.shuffle(mid);
      cast = [cast[0], ...swapped, cast[cast.length - 1]];
    }
  }
  cast = cast.filter((c) => COMPS[c]);

  // On the mobile layout the how-it-works cards live in a carousel: every slide
  // reports the same rect, so a shot aimed at one of them may frame whichever
  // slide happens to be showing. Not worth the coin flip in a short ad.
  if (fmt.mobile) {
    const CAROUSEL = ['cardInstall', 'cardSave', 'cardCompare', 'howItWorks'];
    const filtered = cast.filter((c) => !CAROUSEL.includes(c));
    if (filtered.length >= 3) cast = filtered;
  }

  // The click is the payoff, so it belongs at the end — just before the closing
  // card. Left wherever the shuffle put it, the ad peaks in the middle.
  const ctaAt = cast.findIndex((c) => COMPS[c].clickable);
  if (ctaAt >= 0) {
    // Re-insert the component we just removed, by name. Hardcoding 'heroCta'
    // here silently dropped the CTA for any site profile that names its
    // clickable component something else.
    const [ctaName] = cast.splice(ctaAt, 1);
    cast.splice(Math.max(1, cast.length - 1), 0, ctaName);
  }
  if (!cast.includes('heroCta') && rng.chance(0.6)) {
    // The click beat is the ad's payoff — insert it near the end most times.
    cast.splice(cast.length - 1, 0, 'heroCta');
  }

  // --- fit the cast to the requested duration ---------------------------
  const [dlo, dhi] = mood.shotDur;
  const avg = (dlo + dhi) / 2;
  const n = Math.max(3, Math.round(targetDur / avg));

  // Trim from the middle so the opening and closing beats always survive, and
  // drop a non-clickable beat where possible — on a very short reel the CTA is
  // the last thing that should be cut.
  while (cast.length > n && cast.length > 3) {
    const middle = cast.slice(1, -1).map((c, i) => [c, i + 1]);
    const droppable = middle.filter(([c]) => !COMPS[c].clickable);
    const pool = droppable.length ? droppable : middle;
    cast.splice(pool[rng.int(0, pool.length - 1)][1], 1);
  }

  // Grow by introducing components the reel hasn't shown yet, and only once
  // the library is exhausted fall back to revisiting one. Never place the same
  // component in adjacent beats — that reads as a stall, not a shot.
  while (cast.length < n) {
    const unused = FILLER_LIST.filter((c) => !cast.includes(c));
    const pool = unused.length ? unused : FILLER_LIST;
    let inserted = false;
    for (let attempt = 0; attempt < 8 && !inserted; attempt++) {
      const pick = rng.pick(pool);
      const at = rng.int(1, cast.length - 1);
      if (cast[at - 1] !== pick && cast[at] !== pick) {
        cast.splice(at, 0, pick);
        inserted = true;
      }
    }
    if (!inserted) cast.splice(cast.length - 1, 0, rng.pick(pool));
  }

  // Padding above can reintroduce names the profile does not define.
  cast = cast.filter((c) => COMPS[c]);
  if (!cast.length) throw new Error(`director: no known components for this site profile`);

  // --- assign a motion kind to each beat --------------------------------
  const shots = [];
  let lastKind = null;
  for (let i = 0; i < cast.length; i++) {
    const compName = cast[i];
    const allowed = AFF[compName] || ['pushIn', 'hold'];
    // Weight by mood, and never repeat the previous kind back-to-back.
    const pairs = allowed
      .filter((k) => k !== lastKind || allowed.length === 1)
      .map((k) => {
        let w = mood.kindBias[k] ?? 1;
        // The cursor landing on a real button is the ad's payoff beat, so on a
        // clickable component it should be the strong default rather than one
        // option among equals.
        if (k === 'cursorClick' && COMPS[compName].clickable) w *= 6;
        return [k, w];
      });
    const kind = rng.weighted(pairs);
    lastKind = kind;

    // Quantise every shot to an even number of beats at the score's tempo, so
    // cuts land ON the music instead of near it. This is the cheapest thing in
    // the whole system that makes the edit feel deliberate.
    const beat = 60 / mood.music.tempo;
    const rawDur = rng.float(dlo, dhi);
    const beats = Math.max(2, Math.round(rawDur / beat / 2) * 2);
    const dur = +(beats * beat).toFixed(3);
    const comp = COMPS[compName];
    const isFirst = i === 0;
    const isLast = i === cast.length - 1;

    // Captions only go on components whose own headline is out of frame when
    // the camera pushes into them (the UI mockups). Everything else already
    // shows its copy on the page, and an overlay would print it twice.
    const prevHadCaption = shots.length && shots[shots.length - 1].caption;
    // On the mobile layout the section headings sit right beside the mockups
    // and stay in frame, so an overlay caption prints the same words twice.
    // Desktop pushes them out of shot, which is why the caption exists at all.
    const wantCaption = !fmt.portrait && comp.captionable && comp.copy && !prevHadCaption && rng.chance(0.85);

    shots.push({
      component: compName,
      kind,
      duration: dur,
      easing: rng.pick(mood.easings),
      params: {
        easing: rng.pick(mood.easings),
        dir: rng.pick(['left', 'right']),
        // Portrait frames tightly. A tall viewport otherwise catches the
        // sections above and below the subject and clips their text mid-word,
        // which looks like a bug rather than a composition.
        // Portrait frames tighter than landscape, but not to the frame edge:
        // pushIn zooms a further x1.16 on top of `fill`, and at 0.99 a wide
        // mockup overran the frame and got clipped mid-word.
        fill: fmt.portrait ? +rng.float(0.78, 0.86).toFixed(3) : +rng.float(0.62, 0.86).toFixed(3),
        from: +rng.float(0.82, 0.95).toFixed(3),
        to: +rng.float(1.02, 1.16).toFixed(3),
        arc: rng.int(28, 62),
        rot: +rng.float(-0.8, 0.8).toFixed(2),
        blur: rng.int(6, 13),
        distance: rng.int(180, 420),
        clickAt: +rng.float(0.5, 0.68).toFixed(2),
        // NOT 'from' — that key is already the numeric zoom start for
        // pushIn/pullBack, and reusing it turned their zoom into NaN.
        fromSide: rng.pick(['left', 'right', 'bottom', 'top']),
      },
      caption: wantCaption
        ? { ...comp.copy, align: 'left', anchor: 'bottom', theme: comp.theme, accent: '#7c3aed' }
        : null,
      transitionIn: isFirst ? 'fadeFromWhite' : rng.pick(mood.transition),
    });
  }

  // Guarantee the payoff beat. Weighting alone left roughly a quarter of reels
  // with no cursor ever touching a button, and "watch it get clicked" is the
  // point of the ad — so if nothing drew cursorClick, promote the clickable
  // component's shot. Approach angle, arc and click timing still vary per seed,
  // so this costs no real variety.
  if (!shots.some((s) => s.kind === 'cursorClick')) {
    const target = shots.find((s) => COMPS[s.component].clickable);
    if (target) target.kind = 'cursorClick';
  }

  // --- title cards ------------------------------------------------------
  //
  // A run of camera moves over a website is a screen recording. What makes it
  // an ad is connective tissue: a hook up front, a line of copy introducing
  // each feature, and a sign-off. Cards carry the copy on brand, so the shot
  // that follows can just show the product without text over it.
  let finalShots = shots;
  if (opts.cards !== false) {
    const beat = 60 / mood.music.tempo;
    const cardBeats = Math.max(2, Math.round(2.8 / beat / 2) * 2);
    const cardDur = +(cardBeats * beat).toFixed(3);
    // Cards paint over the whole frame, so the component behind one only has
    // to resolve — it is never seen.
    const anchor = COMPS.hero ? 'hero' : Object.keys(COMPS)[0];

    // Deal out entrances without repeating one twice in a row — identical
    // cross-fades on every card are what makes a reel look like a template.
    const ENTRANCES = ['left', 'right', 'up', 'wipe', 'down', 'wipeUp', 'fade'];
    const bag = rng.shuffle(ENTRANCES);
    let entranceAt = 0;
    const nextEntrance = () => bag[entranceAt++ % bag.length];

    const makeCard = (copy) => ({
      component: anchor,
      kind: 'titleCard',
      duration: cardDur,
      easing: 'smoother',
      params: { fill: 0.8, easing: 'smoother', enter: nextEntrance() },
      caption: { ...copy, align: 'center', anchor: 'center', theme: 'dark' },
      transitionIn: 'dissolve',
      isCard: true,
    });

    const out = [makeCard(opts.hook || HOOK)];
    let used = 0;
    for (const s of shots) {
      const copy = COMPS[s.component]?.copy;
      // One card per feature beat, up to three — past that it stops being an
      // ad and turns back into the slide deck this replaced.
      const isClosing = s === shots[shots.length - 1];
      // The closing component gets the sign-off card, not a duplicate of its
      // own copy immediately beforehand.
      if (copy && used < 3 && !isClosing && s.component !== anchor && !COMPS[s.component].clickable) {
        out.push(makeCard(copy));
        s.caption = null; // the card already said it; don't print it twice
        used++;
      }
      out.push(s);
    }
    out.push(makeCard(opts.signoff || SIGNOFF));
    finalShots = out;
  }

  const shotsOut = finalShots;
  const total = shotsOut.reduce((s, x) => s + x.duration, 0);

  return {
    version: 1,
    prompt,
    seed,
    mood: moodName,
    fps: opts.fps || 30,
    format: fmtName,
    ...fmt,
    look: {
      // Portrait needs BIGGER bars, not smaller. The mobile layout is short
      // relative to a 9:16 viewport, so the sections above and below the
      // subject are always partly in frame and get clipped mid-sentence. Bars
      // mask that, and they double as safe zones for the Reels/TikTok UI that
      // overlays the top and bottom of the screen anyway.
      letterbox: fmt.portrait ? Math.max(2.4, mood.letterbox * 2.4) : mood.letterbox,
      vignette: mood.vignette,
      brand: true,
    },
    duration: +total.toFixed(2),
    shots: shotsOut,
    music: {
      ...mood.music,
      seed: seed ^ 0x9e3779b9,
      duration: +total.toFixed(2),
      // Cut points let the score breathe with the edit.
      cuts: shotsOut.reduce((acc, s) => (acc.push(+((acc[acc.length - 1] || 0) + s.duration).toFixed(2)), acc), []),
    },
  };
}
