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

import { extractFacts } from './bigticket-facts.mjs';

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
    // Quotes the page. See lib/tokens.mjs — a line whose numbers cannot be
    // resolved is dropped rather than printed with a hole in it.
    copy: { kicker: '', title: 'Buying something big?', subtitle: '' },
  },
  // Accordion rows. These really open — the click is the point of the shot.
  specGeneral: {
    route: PDP, sel: 'text=GENERAL INFORMATION', climb: 1,     // 508x44 button
    label: 'General information', theme: 'light', clickable: true, interactive: true,
    copy: { kicker: '', title: 'Every detail, checked.', subtitle: '' },
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
    copy: { kicker: '', title: 'Big Ticket compares every seller.', subtitle: '' },
  },
  priceChart: {
    route: PDP, sel: 'text=Pricing History', climb: 1,         // section with the 508x180 svg
    label: 'Price history chart', theme: 'light', captionable: true,
    copy: { kicker: '', title: "And every price it's ever been.", subtitle: '' },
  },
  // The argument's punchline. Separate from priceChart so the chart can be
  // framed twice with two different lines rather than repeating one.
  priceDelta: {
    route: PDP, sel: 'text=Pricing History', climb: 1,
    label: 'Price history (delta)', theme: 'light', captionable: true,
    copy: { kicker: '', title: "This one's been {overLow} cheaper.", subtitle: '' },
  },
  reviewsBlock: {
    route: PDP, sel: 'text=Review Highlights', climb: 1,       // 508x37 heading block
    label: 'Review highlights', theme: 'light', captionable: true,
    copy: { kicker: '', title: "AI reads the reviews, so you don't.", subtitle: '' },
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
  priceDelta: ['punchIn', 'pushIn', 'spotlight', 'zoomBlurIn'],
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
  { match: /\b(price|pricing|deal|cheap|discount|track|drop|cost|histor|compar)/i, comps: ['priceChart', 'priceDelta', 'compareOptions'] },
  { match: /\b(review|rating|opinion|ai|summar)/i, comps: ['reviewsBlock'] },
  { match: /\b(board|sav(e|es|ed|ing)|organi[sz]|collect)/i, comps: ['boardTile', 'matchHeading'] },
  { match: /\b(refer|friend|reward|gift|invite|earn|share)/i, comps: ['giftHeadline', 'shareVia', 'stepShare', 'stepReward'] },
  { match: /\b(recommend|match|discover|for you|pick)/i, comps: ['matchHeading', 'tileToaster', 'tileCoffee', 'tileTv'] },
];

// Hook on a real product, tap something that responds, pay off on the chart.
// The argument, in order: here is the price, here is who sells it, here is what
// it used to cost, here is what you are overpaying, here is the verdict.
// A spine is a claim sequence, not a tour of the navigation.
export const REELS_SPINE = ['productShot', 'compareOptions', 'priceChart', 'priceDelta', 'reviewsBlock'];

// Spec accordions are deliberately absent from the spine AND the filler below.
// They film well — a row opening on camera is the best interaction on the site
// — but this company compares what a product costs at every retailer and what
// it has cost over time. An ad that spends three of twelve beats on "Slot
// Count: 2" is advertising a product manual. They stay castable for a prompt
// that asks about specs (see REELS_TOPICS) and never volunteer.

// Product page only, ordered by how much each one sells the product — padding
// is drawn front-weighted from this list.
//
// The dashboard and referral components are deliberately absent, not merely
// demoted. Filmed, they are worse than they look in the DOM: the product tiles
// are lifestyle photography, so a tile framed to fill a 9:16 shot is 2.5s of a
// dark cupboard corner with a caption under it, and `matchHeading` sits below
// an empty Saved Products block on a fresh account, so half that frame is
// blank. Neither carries a price, a spec or a claim. Once padding could reach
// them it did, because the product page only offers seven beats and a 30s reel
// wants ten.
//
// The padding loop revisits an exhausted list rather than failing, and a second
// angle on the price chart is a better shot than a first angle on a cupboard.
// All of these stay castable when a prompt actually asks (see REELS_TOPICS).
export const REELS_FILLER = [
  'priceChart', 'priceDelta', 'compareOptions', 'reviewsBlock', 'productShot',
  'productTitle',
];

// The hook quotes the price, because a number is a stronger opening than a
// slogan — and if the page will not give one up, the generic line still runs.
// The hook states the PROBLEM, in the viewer's words.
//
// Earlier hooks were about this toaster: "You're about to spend $229.95." That
// makes the toaster the subject of the ad. The toaster is the demo — the
// subject is not knowing where the best deal is, and the product is the answer
// to that. An ad promotes the thing being sold, and the thing being sold here
// is Big Ticket.
export const REELS_HOOK = {
  kicker: '',
  title: "You don't know where the best deal is.",
  subtitle: '',
};

// Two beats of the argument have no component of their own on the page, so
// they are not in this file — they are the hook and the sign-off.

// The sign-off names the advertiser and says where to get it.
//
// Every cut before this one ended on a line about the price — "Buy once. Buy
// well.", "Know the real price." — and a viewer who watched the whole thing
// still could not say who had advertised to them or what was being sold. The
// brand appeared once, as a watermark. An ad has to identify itself and ask
// for the click.
//
// The sign-off also has to be where the VIEWER wins.
//
// An earlier cut ended on "So you'd overpay by $30." — every number in it true,
// and the arc was: you are about to be ripped off, here is exactly how much,
// goodbye. That makes the product the bearer of bad news rather than the thing
// that saves you, and nobody shares an ad that ends on their own loss. The same
// $30 reframed as money still in your pocket is the identical fact and the
// opposite feeling.
export const REELS_SIGNOFF = {
  kicker: '',
  title: 'Big Ticket. Free on Chrome.',
  subtitle: '',
};

export const REELS_PROFILE = {
  components: REELS_COMPONENTS,
  extract: extractFacts,
  // The spine states a case in order; the director must not reshuffle it.
  narrative: true,
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
