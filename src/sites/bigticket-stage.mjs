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
  // The ad opens on a CHOICE. Every earlier cut opened on the single product it
  // closed on, so there was nothing being compared and nothing being decided.
  browseGrid: {
    sel: '#sceneBrowse', label: 'Several products', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: 'Buying something big?', subtitle: '' },
  },
  productHero: {
    sel: '#sceneProduct', label: 'Product, full bleed', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: "You don't know where the best deal is.", subtitle: '' },
  },
  priceMega: {
    sel: '#scenePrice', label: 'The price', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: "Here's what it costs.", subtitle: '' },
  },
  retailerRows: {
    sel: '#sceneRetailers', label: 'Retailer list', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: 'Big Ticket compares every seller.', subtitle: '' },
  },
  historyChart: {
    sel: '#sceneChart', label: 'Price history, redrawn', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: "And every price it's ever been.", subtitle: '' },
  },
  // NOT "you would have overpaid by {overLow}". Same chart, and the difference
  // between an advertisement and an accusation is which way it is pointed.
  reviewsCard: {
    sel: '#sceneReviews', label: 'Reviews, summarised', theme: 'light',
    captionable: true,
    copy: { kicker: '', title: "AI reads the reviews, so you don't.", subtitle: '' },
  },
  signoff: {
    sel: '#sceneSignoff', label: 'Sign-off', theme: 'light',
  },
};

// A scene is exactly one frame, so there is no small element to hunt for and
// no lateral room to pan into. The moves that suit a full-frame graphic are
// scale and reveal, not travel.
export const STAGE_AFFINITY = {
  browseGrid: ['pushIn', 'pullBack', 'sweepReveal', 'tiltReveal'],
  productHero: ['pushIn', 'pullBack', 'rackFocus', 'zoomBlurIn', 'hold'],
  priceMega: ['punchIn', 'pushIn', 'zoomBlurIn', 'pulseFocus'],
  retailerRows: ['pushIn', 'sweepReveal', 'slideIn', 'tiltReveal'],
  historyChart: ['sweepReveal', 'pushIn', 'pullBack', 'tiltReveal'],
  reviewsCard: ['pushIn', 'pulseFocus', 'zoomBlurIn'],
  signoff: ['pushIn', 'hold', 'pulseFocus'],
};

export const STAGE_TOPICS = [
  { match: /\b(price|pricing|cost|deal|cheap|spend)/i, comps: ['priceMega', 'historyChart'] },
  { match: /\b(retail|seller|store|compar|shop|merchant)/i, comps: ['retailerRows'] },
  { match: /\b(histor|track|drop|was|before|time)/i, comps: ['historyChart'] },
  { match: /\b(review|rating|opinion|ai|summar)/i, comps: ['reviewsCard'] },
  { match: /\b(browse|choose|pick|discover|recommend)/i, comps: ['browseGrid'] },
];

// Browse -> the problem -> what it costs -> who sells it -> what it has cost ->
// the verdict -> the ask.
export const STAGE_SPINE = [
  'browseGrid', 'productHero', 'priceMega',
  'retailerRows', 'historyChart', 'reviewsCard', 'signoff',
];

export const STAGE_FILLER = [
  'retailerRows', 'historyChart', 'priceMega', 'productHero', 'reviewsCard',
];

export const STAGE_HOOK = {
  kicker: '', title: "You don't know where the best deal is.", subtitle: '',
};

export const STAGE_SIGNOFF = {
  kicker: '', title: 'Big Ticket. Free on Chrome.', subtitle: '',
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
