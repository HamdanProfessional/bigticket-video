// Site profile for the STAGE — the locally-built page assembled from an
// exported component library (see library.mjs and stage.mjs).
//
// It is a site profile like any other, because the stage is a webpage like any
// other. That is the whole point: the recorder, the camera, the shot library,
// the captions, the grade and the score are all unchanged, and the only thing
// that differs is what they are pointed at.
//
// Two differences from the live-site profiles, both consequences of the stage
// being ours rather than the vendor's:
//
// 1. Nothing needs `climb`. Every component is an element we authored with an
//    id, so selectors are exact and cannot drift when the site ships a redesign.
// 2. Nothing is `interactive`. There is no app state to change — the material
//    has already been extracted. Interaction beats (an accordion opening, the
//    dropdown dropping) only exist on the live-site profiles, which is a real
//    argument for cutting the two together rather than choosing between them.

export const STAGE_COMPONENTS = {
  productHero: {
    sel: '#sceneProduct', label: 'Product, full bleed', theme: 'dark',
    captionable: true,
    copy: { kicker: '', title: 'One product. Every retailer.', subtitle: '' },
  },
  priceMega: {
    sel: '#scenePrice', label: 'The price', theme: 'dark',
    captionable: true,
    copy: { kicker: '', title: "You're about to spend {price}.", subtitle: '' },
  },
  retailerRows: {
    sel: '#sceneRetailers', label: 'Retailer list', theme: 'dark',
    captionable: true,
    copy: { kicker: '', title: '{sellers} retailers. Same price.', subtitle: '' },
  },
  historyChart: {
    sel: '#sceneChart', label: 'Price history, redrawn', theme: 'dark',
    captionable: true,
    copy: { kicker: '', title: 'But it was {low} in {lowDate}.', subtitle: '' },
  },
  deltaMega: {
    sel: '#sceneDelta', label: 'The overpayment', theme: 'dark',
    captionable: true,
    copy: { kicker: '', title: "So you'd overpay by {overLow}.", subtitle: '' },
  },
  signoff: {
    sel: '#sceneSignoff', label: 'Sign-off', theme: 'dark',
  },
};

// A scene is exactly one frame, so there is no small element to hunt for and
// no lateral room to pan into. The moves that suit a full-frame graphic are
// scale and reveal, not travel.
export const STAGE_AFFINITY = {
  productHero: ['pushIn', 'pullBack', 'rackFocus', 'zoomBlurIn', 'hold'],
  priceMega: ['punchIn', 'pushIn', 'zoomBlurIn', 'pulseFocus'],
  retailerRows: ['pushIn', 'sweepReveal', 'slideIn', 'tiltReveal'],
  historyChart: ['sweepReveal', 'pushIn', 'pullBack', 'tiltReveal'],
  deltaMega: ['punchIn', 'zoomBlurIn', 'pushIn', 'pulseFocus'],
  signoff: ['pushIn', 'hold', 'pulseFocus'],
};

export const STAGE_TOPICS = [
  { match: /\b(price|pricing|cost|deal|cheap|overpay|spend)/i, comps: ['priceMega', 'deltaMega'] },
  { match: /\b(retail|seller|store|compar|shop|merchant)/i, comps: ['retailerRows'] },
  { match: /\b(histor|track|drop|was|before|time)/i, comps: ['historyChart'] },
];

export const STAGE_SPINE = [
  'productHero', 'priceMega', 'retailerRows', 'historyChart', 'deltaMega', 'signoff',
];

export const STAGE_FILLER = [
  'historyChart', 'deltaMega', 'priceMega', 'retailerRows', 'productHero',
];

export const STAGE_HOOK = {
  kicker: '', title: "You're about to spend {price}.", subtitle: '',
};

export const STAGE_SIGNOFF = {
  kicker: '', title: 'Know the real price.', subtitle: '',
};

export const STAGE_PROFILE = {
  components: STAGE_COMPONENTS,
  affinity: STAGE_AFFINITY,
  topics: STAGE_TOPICS,
  spine: STAGE_SPINE,
  filler: STAGE_FILLER,
  hook: STAGE_HOOK,
  signoff: STAGE_SIGNOFF,
  narrative: true,
  defaultRoute: '/',
  requiresAuth: false,
  defaultFormat: 'vertical',
  // Facts come from the library index rather than from the page: the stage has
  // already had them baked into its type, and re-reading them off the rendered
  // stage would be reading our own output back.
  factsFromLibrary: true,
};
