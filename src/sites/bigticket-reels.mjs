// Instagram profile for the Big Ticket app — element-level, not section-level.
//
// Three things make this different from the desktop app profile:
//
// 1. It targets the MOBILE DOM. Vertical and square formats film at 540px with
//    a phone user-agent, where responsive utilities swap whole blocks out. Every
//    selector and size here was measured at 540x960, signed in; nothing was
//    carried over from the desktop profile, because almost none of it survives.
//
// 2. The components are ELEMENTS — a single accordion row, one product tile,
//    one share icon — sized 44-508px wide rather than whole sections. A 9:16
//    frame is too narrow to hold a section and too tall to leave it small, so
//    the unit of a vertical shot is one thing, filling the frame.
//
// 3. Some of them are genuinely `interactive`. The recorder really clicks those,
//    so the accordion opens and the dropdown drops on camera. Anything that
//    would navigate is deliberately NOT marked interactive: a shot's route is a
//    long-lived tab, and following a link would replace the page under the
//    camera for every later shot on that route.

const PDP = '/products/6961149f831b6dd08fd055a4';

export const REELS_COMPONENTS = {
  // ---- product page: the interactive core ------------------------------
  productTitle: {
    route: PDP, sel: 'text=SMEG - TSF01', climb: 0,      // 464x38
    label: 'Product title', theme: 'light',
  },
  productShot: {
    route: PDP, sel: 'img[alt="Product image 1"]', climb: 0,   // 472x236
    label: 'Product image', theme: 'light', captionable: true,
    copy: { kicker: 'Any product', title: 'Start with what you want.', subtitle: '' },
  },
  // Accordion rows. These really open — the click is the point of the shot.
  specGeneral: {
    route: PDP, sel: 'text=GENERAL INFORMATION', climb: 1,     // 508x44 button
    label: 'General information', theme: 'light', clickable: true, interactive: true,
    copy: { kicker: 'Every spec', title: 'Open it up.', subtitle: '' },
  },
  specPerformance: {
    route: PDP, sel: 'text=PERFORMANCE & FEATURES', climb: 1,  // 508x44
    label: 'Performance & features', theme: 'light', clickable: true, interactive: true,
  },
  specDimensions: {
    route: PDP, sel: 'text=DIMENSIONS & WEIGHT', climb: 1,     // 508x44
    label: 'Dimensions & weight', theme: 'light', clickable: true, interactive: true,
  },
  // The dropdown that filters which sellers the chart plots.
  compareOptions: {
    route: PDP, sel: 'text=Compare Buying Options', climb: 1,  // 508x40
    label: 'Compare buying options', theme: 'light', clickable: true, interactive: true,
    captionable: true,
    copy: { kicker: 'Three sellers', title: 'Compare who is cheapest.', subtitle: '' },
  },
  priceChart: {
    route: PDP, sel: 'text=Pricing History', climb: 1,         // section with the 508x180 svg
    label: 'Price history chart', theme: 'light', captionable: true,
    copy: { kicker: 'Price history', title: 'Is it actually a deal?', subtitle: '' },
  },
  reviewsBlock: {
    route: PDP, sel: 'text=Review Highlights', climb: 1,       // 508x37 heading block
    label: 'Review highlights', theme: 'light', captionable: true,
    copy: { kicker: 'AI summary', title: 'Every review, in one line.', subtitle: '' },
  },

  // ---- dashboard: a real product grid ----------------------------------
  // The signed-in dashboard recommends actual products, which is the one place
  // a fresh account still has something worth filming.
  matchHeading: {
    route: '/dashboard', sel: 'text=Find your perfect match', climb: 0,  // 247x34
    label: 'Find your perfect match', theme: 'light', captionable: true,
    copy: { kicker: 'For you', title: 'Picked for what you buy.', subtitle: '' },
  },
  tileToaster: {
    route: '/dashboard', sel: 'img[alt="SMEG Toaster"]', climb: 0,       // 142x151
    label: 'SMEG toaster tile', theme: 'light',
  },
  tileCoffee: {
    route: '/dashboard', sel: 'img[alt="Breville Coffee Maker"]', climb: 0,
    label: 'Coffee maker tile', theme: 'light',
  },
  tileTv: {
    route: '/dashboard', sel: 'img[alt="LG StanbyME 2"]', climb: 0,
    label: 'TV tile', theme: 'light',
  },
  boardTile: {
    route: '/dashboard', sel: 'img[alt="test"]', climb: 1,               // 142x150
    label: 'Board tile', theme: 'light', captionable: true,
    copy: { kicker: 'Boards', title: 'One board per decision.', subtitle: '' },
  },

  // ---- referral: strong graphics, real copy ----------------------------
  // Prefix stops before the line wrap. innerText keeps the break, so this
  // heading reads "Earn a $10 Gift\nCard." and a `text=` prefix spanning the
  // wrap matches nothing — the selector has to stay inside one visual line.
  giftHeadline: {
    route: '/referral', sel: 'text=Earn a $10 Gift', climb: 0,           // 349x90
    label: 'Gift card headline', theme: 'light', captionable: true,
    copy: { kicker: 'Refer a friend', title: 'Earn a $10 gift card.', subtitle: '' },
  },
  shareVia: {
    route: '/referral', sel: 'text=Share Via', climb: 1,                 // 460x77
    label: 'Share options', theme: 'light',
  },
  stepShare: {
    route: '/referral', sel: 'text=Share your link', climb: 1,           // 285x50
    label: 'Step: share your link', theme: 'light',
  },
  stepSave: {
    route: '/referral', sel: 'text=They save 5 products', climb: 1,
    label: 'Step: they save', theme: 'light',
  },
  stepReward: {
    route: '/referral', sel: 'text=Get your $10', climb: 1,   // wraps after "$10"
    label: 'Step: get rewarded', theme: 'light',
  },
};

// Vertical favours shots that hold still and let the UI move: tapFocus,
// pulseFocus, spotlight. Wide lateral moves have nowhere to go in 9:16.
export const REELS_AFFINITY = {
  productTitle: ['pushIn', 'pulseFocus', 'slideIn'],
  productShot: ['pushIn', 'rackFocus', 'pulseFocus', 'zoomBlurIn', 'hold'],
  specGeneral: ['tapFocus', 'pulseFocus', 'spotlight'],
  specPerformance: ['tapFocus', 'pulseFocus', 'spotlight'],
  specDimensions: ['tapFocus', 'pulseFocus', 'spotlight'],
  compareOptions: ['tapFocus', 'spotlight', 'pulseFocus'],
  priceChart: ['pushIn', 'pullBack', 'spotlight', 'sweepReveal', 'tiltReveal'],
  reviewsBlock: ['pushIn', 'pulseFocus', 'spotlight', 'tiltReveal'],

  matchHeading: ['pushIn', 'slideIn', 'pulseFocus'],
  tileToaster: ['pushIn', 'pulseFocus', 'zoomBlurIn', 'rackFocus'],
  tileCoffee: ['pushIn', 'pulseFocus', 'slideIn', 'rackFocus'],
  tileTv: ['pushIn', 'pulseFocus', 'slideIn', 'zoomBlurIn'],
  boardTile: ['pushIn', 'pulseFocus', 'spotlight', 'rackFocus'],

  giftHeadline: ['pushIn', 'sweepReveal', 'pullBack', 'zoomBlurIn'],
  shareVia: ['pushIn', 'pulseFocus', 'spotlight', 'slideIn'],
  stepShare: ['slideIn', 'pushIn', 'pulseFocus'],
  stepSave: ['slideIn', 'pushIn', 'pulseFocus'],
  stepReward: ['slideIn', 'pushIn', 'spotlight'],
};

export const REELS_TOPICS = [
  { match: /\b(spec|detail|dimension|feature|information)/i, comps: ['specGeneral', 'specPerformance', 'specDimensions'] },
  { match: /\b(price|pricing|deal|cheap|discount|track|drop|cost|histor|compar)/i, comps: ['priceChart', 'compareOptions'] },
  { match: /\b(review|rating|opinion|ai|summar)/i, comps: ['reviewsBlock'] },
  { match: /\b(board|sav(e|es|ed|ing)|organi[sz]|collect)/i, comps: ['boardTile', 'matchHeading'] },
  { match: /\b(refer|friend|reward|gift|invite|earn|share)/i, comps: ['giftHeadline', 'shareVia', 'stepShare', 'stepReward'] },
  { match: /\b(recommend|match|discover|for you|pick)/i, comps: ['matchHeading', 'tileToaster', 'tileCoffee', 'tileTv'] },
];

// Hook on a real product, tap something that responds, pay off on the chart.
export const REELS_SPINE = ['productShot', 'specGeneral', 'compareOptions', 'priceChart', 'reviewsBlock'];

export const REELS_FILLER = [
  'priceChart', 'reviewsBlock', 'tileToaster', 'specPerformance', 'matchHeading',
  'tileCoffee', 'giftHeadline', 'specDimensions', 'tileTv', 'boardTile',
];

export const REELS_HOOK = {
  kicker: 'Big Ticket',
  title: 'Before you spend big.',
  subtitle: '',
};

export const REELS_SIGNOFF = {
  kicker: 'Free on Chrome',
  title: 'Buy once. Buy well.',
  subtitle: '',
};

export const REELS_PROFILE = {
  components: REELS_COMPONENTS,
  affinity: REELS_AFFINITY,
  topics: REELS_TOPICS,
  spine: REELS_SPINE,
  filler: REELS_FILLER,
  hook: REELS_HOOK,
  signoff: REELS_SIGNOFF,
  defaultRoute: '/dashboard',
  requiresAuth: true,
  // Reels and feed posts only. Filming this profile in landscape would frame
  // 44px-tall elements across a 1440px frame.
  defaultFormat: 'vertical',
};
