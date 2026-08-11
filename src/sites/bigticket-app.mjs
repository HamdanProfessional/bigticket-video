// Site profile for the Big Ticket **app** — the signed-in product, not the
// marketing page.
//
// Every component carries a `route`, because unlike a landing page an app's
// story lives across several pages. The recorder keeps one primed tab per
// route and cuts between them, so a shot change can also be a page change.
//
// Selectors and `climb` values were measured against the live DOM (see
// `--probe` in the retarget-site skill), not guessed: `climb` is the number of
// parents to walk up from the text match to reach the block worth framing, and
// the measured size of that block is noted on each entry.

const PDP = '/products/6961149f831b6dd08fd055a4';

export const APP_COMPONENTS = {
  // ---- dashboard --------------------------------------------------------
  welcome: {
    route: '/dashboard',
    sel: 'text=Welcome back', climb: 2,          // 1440x150 banner
    label: 'Dashboard welcome', theme: 'dark',
    copy: { kicker: 'Your dashboard', title: 'Everything you saved, in one place.', subtitle: 'Boards, prices and reviews — together.' },
  },
  refer: {
    route: '/dashboard',
    sel: 'text=Help your friends buy better', climb: 2,   // 1216x111
    label: 'Referral banner', theme: 'light', clickable: true,
    copy: { kicker: 'Refer & earn', title: 'Help your friends buy better.', subtitle: 'They discover Big Ticket. You earn rewards.' },
  },
  // Deliberately on /boards, not /dashboard. The dashboard's boards strip sits
  // directly above "Recently Saved Products — start saving your favorite
  // products today", and at this component's aspect the camera cannot frame one
  // without the other. Advertising a product by filming its empty state is
  // worse than not filming it at all.
  myBoards: {
    route: '/boards',
    sel: 'text=Create a new board', climb: 3,    // 1185x286 — the boards grid
    label: 'My Boards', theme: 'light', captionable: true,
    copy: { kicker: 'Boards', title: 'Group what you are deciding between.', subtitle: 'One board per decision.' },
  },
  blog: {
    route: '/dashboard',
    sel: 'text=Recent Blog Posts', climb: 2,     // 1230x709
    label: 'Blog strip', theme: 'light',
  },

  // ---- product detail ---------------------------------------------------
  // The richest surface in the product, and the one the marketing page can
  // only show a mockup of.
  gallery: {
    route: PDP,
    sel: 'text=Previous', climb: 4,              // 280x368 product image
    label: 'Product gallery', theme: 'light',
  },
  offers: {
    route: PDP,
    sel: 'text=Best Buy', climb: 4,              // 1200x212 retailer price rows
    label: 'Retailer offers', theme: 'light', captionable: true,
    copy: { kicker: 'Every retailer', title: 'One product. Every price.', subtitle: 'Live offers side by side.' },
  },
  specs: {
    route: PDP,
    sel: 'text=Product Details', climb: 1,       // 593x663
    label: 'Product details', theme: 'light',
  },
  priceHistory: {
    route: PDP,
    sel: 'text=Pricing History', climb: 1,       // 1272x1025 — the hero feature
    label: 'Pricing history', theme: 'light', captionable: true,
    copy: { kicker: 'Price history', title: 'Know if it is actually a deal.', subtitle: 'Record low, record high, every seller.' },
  },
  reviews: {
    route: PDP,
    sel: 'text=Reviews summary', climb: 3,       // 1200x400
    label: 'AI review summary', theme: 'light', captionable: true,
    // No hardcoded review count. It said "Thirteen reviews" while the page
    // behind it read "31 reviews" — the figure had moved since the copy was
    // written, and an ad that miscounts the number it is bragging about, next
    // to that number, destroys its own credibility. Any claim quoting live data
    // has to come from the DOM or not be a number at all.
    copy: { kicker: 'Powered by AI', title: 'Every review, one answer.', subtitle: 'Summarised so you do not have to read them.' },
  },
  highlights: {
    route: PDP,
    sel: 'text=Review Highlights', climb: 2,     // 1200x433
    label: 'Review highlights', theme: 'light',
  },

  // ---- referral ---------------------------------------------------------
  giftcard: {
    route: '/referral',
    sel: 'text=Earn a $10 Gift Card', climb: 1,  // 1352x400
    label: 'Gift card hero', theme: 'light', captionable: true,
    copy: { kicker: 'Refer a friend', title: 'Earn a $10 gift card.', subtitle: 'Five friends. One reward.' },
  },
  referralLink: {
    route: '/referral',
    sel: 'text=Your Referral Link', climb: 1,    // 773x393
    label: 'Referral link', theme: 'light', clickable: true,
  },
  // Present but NOT in the spine or filler: on a fresh account this reads
  // "0 of 5 friends on board — 0%", which is an empty progress bar. It only
  // earns a place in a film once the account has referrals to show, so it has
  // to be asked for by prompt (see APP_TOPICS) rather than turning up by
  // default.
  progress: {
    route: '/referral',
    sel: 'text=Your Progress', climb: 2,         // 547x393
    label: 'Referral progress', theme: 'light',
    emptyOnFreshAccount: true,
  },
  howItWorks: {
    route: '/referral',
    sel: 'text=How it works', climb: 2,          // 1352x500
    label: 'How it works', theme: 'light',
  },

  // ---- boards -----------------------------------------------------------
  boardsHeader: {
    route: '/boards',
    sel: 'text=My Boards', climb: 2,             // 1440x150
    label: 'Boards header', theme: 'dark',
  },
  createBoard: {
    route: '/boards',
    sel: 'text=Create a new board', climb: 1,    // 160x32 — a real button
    label: 'Create a board', theme: 'light', clickable: true,
    copy: { kicker: 'One click', title: 'Start a new board.', subtitle: 'A board per decision you are making.' },
  },
};

export const APP_AFFINITY = {
  welcome: ['pushIn', 'hold', 'slideIn', 'zoomBlurIn'],
  refer: ['cursorClick', 'spotlight', 'pulseFocus', 'slideIn'],
  myBoards: ['pushIn', 'pullBack', 'spotlight', 'slideIn', 'pulseFocus', 'tiltReveal'],
  blog: ['panAcross', 'driftDiagonal', 'pullBack'],

  gallery: ['pushIn', 'rackFocus', 'pulseFocus', 'hold'],
  offers: ['spotlight', 'pushIn', 'pulseFocus', 'slideIn', 'rackFocus'],
  specs: ['pushIn', 'tiltReveal', 'rackFocus', 'slideIn'],
  priceHistory: ['pullBack', 'pushIn', 'spotlight', 'tiltReveal', 'driftDiagonal', 'sweepReveal', 'zoomBlurIn'],
  reviews: ['spotlight', 'pushIn', 'pulseFocus', 'rackFocus', 'slideIn'],
  highlights: ['panAcross', 'slideIn', 'pushIn', 'driftDiagonal'],

  giftcard: ['pushIn', 'pullBack', 'sweepReveal', 'hold', 'zoomBlurIn'],
  referralLink: ['cursorClick', 'spotlight', 'pulseFocus'],
  progress: ['pushIn', 'spotlight', 'pulseFocus', 'slideIn'],
  howItWorks: ['pushIn', 'tiltReveal', 'pullBack', 'slideIn'],

  boardsHeader: ['pushIn', 'hold', 'slideIn'],
  createBoard: ['cursorClick', 'spotlight', 'pulseFocus'],
};

export const APP_TOPICS = [
  { match: /\b(price|pricing|deal|cheap|discount|track|drop|cost|histor)/i, comps: ['priceHistory', 'offers'] },
  { match: /\b(review|rating|opinion|feedback|ai|summar)/i, comps: ['reviews', 'highlights'] },
  { match: /\b(board|sav(e|es|ed|ing)|organi[sz]|collect|shortlist)/i, comps: ['myBoards', 'boardsHeader', 'createBoard'] },
  { match: /\b(refer|friend|reward|gift|invite|earn)/i, comps: ['giftcard', 'referralLink', 'howItWorks'] },
  { match: /\b(compar|retail|seller|store|side[- ]by[- ]side)/i, comps: ['offers', 'priceHistory'] },
  { match: /\b(spec|detail|dimension|feature)/i, comps: ['specs', 'gallery'] },
];

// The default arc through the app: arrive, see the thing you saved, see what
// the product actually knows about it, then the payoff.
export const APP_SPINE = ['welcome', 'myBoards', 'offers', 'priceHistory', 'reviews', 'giftcard'];

// `progress` is absent on purpose — see its component note.
export const APP_FILLER = ['priceHistory', 'offers', 'reviews', 'gallery', 'specs', 'highlights', 'myBoards', 'howItWorks', 'giftcard'];

export const APP_HOOK = {
  kicker: 'Big Ticket',
  title: 'Before you spend big.',
  subtitle: 'Every price, every review, one page.',
};

export const APP_SIGNOFF = {
  kicker: 'Free on Chrome',
  title: 'Buy once. Buy well.',
  subtitle: 'Add Big Ticket and shop with confidence.',
};

export const APP_PROFILE = {
  components: APP_COMPONENTS,
  affinity: APP_AFFINITY,
  topics: APP_TOPICS,
  spine: APP_SPINE,
  filler: APP_FILLER,
  hook: APP_HOOK,
  signoff: APP_SIGNOFF,
  // Where a route-less shot lands, and what the recorder opens first.
  defaultRoute: '/dashboard',
  requiresAuth: true,
};
