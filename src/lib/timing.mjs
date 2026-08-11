// Caption timing, shared by the director and the recorder.
//
// These live together because they are two halves of one guarantee: the
// recorder decides when a caption ramps in and out, and the director has to
// make shots long enough that the fully-visible window between those ramps
// clears MIN_TEXT_HOLD. Split them across two files with the numbers copied by
// hand and the guarantee silently rots the first time either side is tuned.

// Fraction of the shot elapsed before the caption starts arriving.
export const CAPTION_LEAD = 0.08;
// Seconds the caption takes to arrive, and to leave.
export const CAPTION_IN = 0.55;
export const CAPTION_OUT = 0.5;

// How long text stays fully readable — after it has finished arriving and
// before it starts leaving. Two seconds is roughly what it takes to read a
// short headline and its subtitle without feeling rushed.
export const MIN_TEXT_HOLD = 2.0;

/**
 * The shortest shot whose caption is fully visible for `hold` seconds.
 *
 * Caption is fully in at   CAPTION_LEAD * d + CAPTION_IN
 * and starts leaving at    d - CAPTION_OUT
 * so the readable window is  d * (1 - CAPTION_LEAD) - CAPTION_IN - CAPTION_OUT.
 */
export function minShotForHold(hold = MIN_TEXT_HOLD) {
  return (hold + CAPTION_IN + CAPTION_OUT) / (1 - CAPTION_LEAD);
}

// The readable window a shot of length `d` actually gives its caption. Useful
// for asserting the guarantee holds rather than trusting it does.
export function textHold(d) {
  return d * (1 - CAPTION_LEAD) - CAPTION_IN - CAPTION_OUT;
}
