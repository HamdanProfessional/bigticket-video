// The director: prompt -> storyboard.
//
// Everything creative is decided here and nowhere else, so the same prompt is
// reproducible and two different prompts produce genuinely different films:
// different beat order, different motion kinds, different pacing, different
// easing, different transitions, and a different musical key/tempo.

import { hashString, makeRng } from './lib/rng.mjs';
import { COMPONENTS, AFFINITY } from './shotlib.mjs';
import { minShotForHold, MIN_TEXT_HOLD } from './lib/timing.mjs';

// ------------------------------------------------------------------ moods
const MOODS = {
  calm: {
    match: /\b(calm|warm|soft|gentle|cosy|cozy|slow|gentle|relax|gentl|serene|gentle)\b/i,
    shotDur: [2.4, 3.4],
    easings: ['smoother', 'easeOutQuint', 'smooth'],
    kindBias: { slideIn: 1.8, hold: 2.2, driftDiagonal: 2.2, pushIn: 2, pullBack: 1.6, rackFocus: 1.4, whipTo: 0.15, panAcross: 1.2, tiltReveal: 1.2, spotlight: 1.9, cursorClick: 1 , pulseFocus: 1.8, sweepReveal: 0.9, zoomBlurIn: 0.3 , punchIn: 0.3, tapFocus: 1.2 },
    letterbox: 1,
    vignette: 0.34,
    transition: ['dissolve', 'dissolve', 'softWipe', 'flare'],
    ramps: ['linear', 'swoop', 'rushSettle'],
    music: { tempo: 78, key: 'F', scale: 'majorSeventh', warmth: 0.92, density: 0.35 },
  },
  premium: {
    match: /\b(premium|luxury|elegant|refined|sophisticat|high[- ]end|cinematic|classy)\b/i,
    shotDur: [2.2, 3.2],
    easings: ['easeOutQuint', 'smoother', 'anticipate'],
    kindBias: { slideIn: 1.6, pushIn: 2.2, pullBack: 2, rackFocus: 2, spotlight: 2.2, driftDiagonal: 1.5, hold: 1.2, whipTo: 0.4, panAcross: 1, tiltReveal: 1, cursorClick: 1 , pulseFocus: 2, sweepReveal: 1.1, zoomBlurIn: 0.6 , punchIn: 0.7, tapFocus: 1.4 },
    letterbox: 1,
    vignette: 0.42,
    transition: ['dissolve', 'softWipe', 'flash', 'zoomCut', 'flare'],
    ramps: ['swoop', 'rushSettle', 'linear', 'holdSnap'],
    music: { tempo: 84, key: 'D', scale: 'minorNinth', warmth: 0.85, density: 0.45 },
  },
  energetic: {
    match: /\b(energetic|fast|punchy|snappy|upbeat|dynamic|bold|hype|exciting)\b/i,
    // Wider than it looks: quantising to whole beats at 120bpm turns this into
    // 1.0/1.5/2.0/2.5s. The old [1.4,2.2] collapsed onto just 1.5 and 2.0, so
    // every product beat in a reel was one of two lengths and the edit read as
    // a metronome.
    shotDur: [1.1, 2.6],
    easings: ['easeOutQuint', 'backOut', 'springOut'],
    kindBias: { slideIn: 2.2, whipTo: 2.4, cursorClick: 2, spotlight: 1.8, pushIn: 1.6, panAcross: 1.4, tiltReveal: 1.2, pullBack: 1, rackFocus: 0.8, hold: 0.3, driftDiagonal: 0.6 , pulseFocus: 1.6, sweepReveal: 2.2, zoomBlurIn: 2 , punchIn: 2.6, tapFocus: 2.2 },
    letterbox: 0.35,
    vignette: 0.2,
    transition: ['zoomCut', 'glitch', 'whip', 'flash', 'spin', 'warp', 'wipe'],
    ramps: ['lingerRush', 'rushSettle', 'holdSnap', 'swoop'],
    music: { tempo: 120, key: 'A', scale: 'majorPent', warmth: 0.6, density: 0.8 },
  },
  playful: {
    match: /\b(playful|fun|friendly|quirky|light|cheerful|happy|bright)\b/i,
    shotDur: [1.7, 2.5],
    easings: ['backOut', 'springOut', 'easeOutQuint'],
    kindBias: { slideIn: 2.2, spotlight: 2, cursorClick: 2, whipTo: 1.4, panAcross: 1.6, pushIn: 1.4, tiltReveal: 1.2, pullBack: 1, hold: 0.6, rackFocus: 0.8, driftDiagonal: 1 , pulseFocus: 1.8, sweepReveal: 2, zoomBlurIn: 1.4 , punchIn: 2.2, tapFocus: 2 },
    letterbox: 0.2,
    vignette: 0.18,
    transition: ['zoomCut', 'wipe', 'flash', 'spin', 'flare', 'dissolve'],
    ramps: ['rushSettle', 'lingerRush', 'swoop', 'holdSnap'],
    music: { tempo: 104, key: 'C', scale: 'majorPent', warmth: 0.75, density: 0.65 },
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
    // Instagram paints its own UI over a Reel: the caption, handle and audio
    // strip along the bottom, the top bar above. Anything the ad puts there is
    // covered by the app. These fractions keep captions and the brand mark
    // inside the band that stays visible.
    safeTop: 0.12, safeBottom: 0.22,
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
  return 24;
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
  // Every pixel distance below was tuned on the 1440-wide landscape frame.
  const pxScale = fmt.width / 1440;

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
  // Front-weighted, because a profile's filler list is ordered by how well each
  // component carries a shot and rng.pick is uniform — which made that ordering
  // decorative. Squaring the draw gives the first entry ~4x the odds of the
  // fourth without ever locking the tail out, so a padded reel leans on the
  // strong material and still varies between seeds.
  const padPick = (pool) => pool[Math.min(pool.length - 1, Math.floor(rng() ** 2 * pool.length))];

  while (cast.length < n) {
    const unused = FILLER_LIST.filter((c) => !cast.includes(c));
    const pool = unused.length ? unused : FILLER_LIST;
    let inserted = false;
    for (let attempt = 0; attempt < 8 && !inserted; attempt++) {
      const pick = padPick(pool);
      const at = rng.int(1, cast.length - 1);
      if (cast[at - 1] !== pick && cast[at] !== pick) {
        cast.splice(at, 0, pick);
        inserted = true;
      }
    }
    if (!inserted) cast.splice(cast.length - 1, 0, padPick(pool));
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
    // Quantise to whole beats, NOT even beats. Forcing even numbers snapped
    // every shot onto the same 4-beat value, so the whole reel ran at one
    // unvarying dwell — technically on-grid, monotonous to watch. Odd beat
    // counts still land on the pulse.
    let beats = Math.max(2, Math.round(rawDur / beat));
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

    // A shot carrying text has to outlast its own ramps by MIN_TEXT_HOLD, or
    // the words are still arriving when they start leaving and nobody reads
    // them. Rounded UP to whole beats so the cut still lands on the pulse.
    if (wantCaption) beats = Math.max(beats, Math.ceil(minShotForHold() / beat));
    const dur = +(beats * beat).toFixed(3);

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
        // Pixel distances are calibrated against a 1440-wide frame and scaled
        // to whatever frame this actually is. Unscaled, a 340px slide is 24% of
        // a landscape frame but 63% of a 540px vertical one, which is how
        // elements ended up leaving the shot entirely.
        arc: Math.round(rng.int(28, 62) * pxScale),
        overshoot: Math.round(rng.int(9, 18) * pxScale),
        rot: +rng.float(-0.8, 0.8).toFixed(2),
        // Blur is a pixel radius, so it scales with the frame like distances do
        // — an unscaled radius is proportionally ~2.7x stronger on vertical and
        // turns a rack focus into an out-of-focus frame.
        blur: Math.max(3, Math.round(rng.int(6, 13) * pxScale)),
        distance: Math.round(rng.int(180, 420) * pxScale),
        clickAt: +rng.float(0.5, 0.68).toFixed(2),
        // NOT 'from' — that key is already the numeric zoom start for
        // pushIn/pullBack, and reusing it turned their zoom into NaN.
        fromSide: rng.pick(['left', 'right', 'bottom', 'top']),
        // Focus border and sweep colour, varied per shot so repeated use of
        // pulseFocus/sweepReveal in one film doesn't read as a stamp.
        ringWidth: +rng.float(2.2, 3.6).toFixed(2),
        color: rng.pick(['#5b46e5', '#7c3aed', '#1cc8ee']),
        // How fast the shot travels its own path. A card holds a steady rate so
        // its copy stays readable; product beats get the ramp.
        ramp: rng.pick(mood.ramps || ['linear']),
        // punchIn: how many discrete hits, and how hard each one lands.
        steps: rng.int(2, 4),
        stepZoom: +rng.float(0.1, 0.17).toFixed(3),
      },
      // A real click, not a mimed one, when the component can take it without
      // navigating. The recorder fires this at the same moment the cursor's
      // press lands, so the UI's own response IS the shot.
      action: (comp.interactive && (kind === 'tapFocus' || kind === 'cursorClick'))
        ? { type: 'click', at: +rng.float(0.44, 0.6).toFixed(2) }
        : null,
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
    // A card is punctuation between product beats, so it wants to be short —
    // but not shorter than the copy on it can be read. Whichever is longer:
    // two beats, or enough beats for the text to hold for MIN_TEXT_HOLD after
    // it has finished arriving.
    const cardBeats = Math.max(2, Math.ceil(minShotForHold() / beat));
    const cardDur = +(cardBeats * beat).toFixed(3);
    // A full-frame card hides whatever is behind it, so it only needs a
    // component that resolves. A side panel does not: half the frame is live,
    // so each card is anchored to the component it is about to introduce.
    const anchor = COMPS.hero ? 'hero' : Object.keys(COMPS)[0];

    // Deal out entrances without repeating one twice in a row — identical
    // cross-fades on every card are what makes a reel look like a template.
    const ENTRANCES = ['left', 'right', 'up', 'wipe', 'down', 'wipeUp', 'fade'];
    const bag = rng.shuffle(ENTRANCES);
    let entranceAt = 0;
    const nextEntrance = () => bag[entranceAt++ % bag.length];

    // Cards alternate which edge they take so consecutive ones don't stack.
    let sideAt = rng.int(0, 2);
    const nextSide = () => (sideAt++ % 2 ? 'right' : 'left');

    // Finishes dealt from a shuffled bag rather than picked independently, so a
    // short film can't draw the same one three times running.
    const styleBag = rng.shuffle(['ink', 'glass', 'brand', 'paper', 'ink', 'glass']);
    let styleAt = 0;
    const nextStyle = () => opts.panelStyle || styleBag[styleAt++ % styleBag.length];

    /**
     * `full` gives a full-frame card — reserved for the sign-off, where the
     * film has finished showing product and the brand should own the frame.
     * Everything else is a side panel: the claim and the thing it is claiming
     * about stay on screen together, which is the difference between an ad and
     * a slide deck spliced into a screen recording.
     */
    const makeCard = (copy, { full = false, over } = {}) => {
      const side = full ? null : nextSide();
      return {
        // Standing over the component it introduces means the panel slides away
        // onto the very thing it just described, instead of every card cutting
        // back to the same hero.
        component: (over && COMPS[over]) ? over : anchor,
        kind: 'titleCard',
        duration: cardDur,
        easing: 'smoother',
        params: side
          // `fill` is a fraction of the free area here, not of the frame —
          // titleCard scales the fit down by the panel's own size.
          ? {
              fill: 0.8, easing: 'smoother', side,
              panelWidth: +rng.float(0.38, 0.44).toFixed(3),
              panelStyle: nextStyle(),
            }
          : { fill: 0.8, easing: 'smoother', enter: nextEntrance(), panelStyle: nextStyle() },
        caption: {
          ...copy,
          align: side ? 'left' : 'center',
          anchor: 'center',
          theme: 'dark',
        },
        transitionIn: 'dissolve',
        isCard: true,
        isPanel: !!side,
      };
    };

    const out = [];
    let used = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const copy = COMPS[s.component]?.copy;
      // One card per feature beat, up to three — past that it stops being an
      // ad and turns back into the slide deck this replaced.
      const isClosing = i === shots.length - 1;
      // The closing component gets the sign-off card, not a duplicate of its
      // own copy immediately beforehand.
      // Never two cards in a row — with the hook moved to second position it
      // otherwise lands directly against the first feature card, giving three
      // seconds of text with no product on screen.
      const prevWasCard = out.length > 0 && out[out.length - 1].isCard;
      // Fewer cards in portrait. A 9:16 cut is short and its cards can't be
      // brief — the 2s text hold puts a floor of ~3.3s on each — so three of
      // them plus a hook and a sign-off swallowed nearly half the runtime.
      // One feature card in portrait. With a hook and a sign-off that is still
      // three cards; at the ~3.3s floor the text hold imposes, any more and the
      // reel is mostly caption. The product beats have to carry it.
      const cardCap = fmt.portrait ? 1 : 3;
      if (i > 0 && !prevWasCard && copy && used < cardCap && !isClosing
          && s.component !== anchor && !COMPS[s.component].clickable) {
        out.push(makeCard(copy, { over: s.component }));
        s.caption = null; // the card already said it; don't print it twice
        used++;
      }
      out.push(s);
      // Cold open: lead with live motion and put the hook card SECOND. Opening
      // on a static panel spends the one second that decides whether anyone
      // keeps watching, before the product has even appeared.
      if (i === 0) out.push(makeCard(opts.hook || HOOK, { over: shots[1]?.component }));
    }
    // The sign-off holds solid to the last frame rather than dissolving — it is
    // the call to action, and it was fading out before the video did.
    const signoffCard = makeCard(opts.signoff || SIGNOFF, { full: true });
    signoffCard.params.holdOut = true;
    out.push(signoffCard);
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
      // Portrait used to force 2.4, which the runtime turns into bars of
      // H*0.062*2.4 each — 30% of a reel painted black, with the page scaled
      // into the middle. A phone frame has no width to spare; keep the bars as
      // a thin cinematic edge and let safeTop/safeBottom do the keep-out work.
      letterbox: fmt.portrait ? 0.5 : mood.letterbox,
      vignette: mood.vignette,
      brand: true,
      // Handheld imperfection strength. 0 disables it entirely.
      handheld: opts.handheld ?? 1,
      // Keeps captions and the brand mark clear of the app's own chrome.
      safeTop: fmt.safeTop ?? 0,
      safeBottom: fmt.safeBottom ?? 0,
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
