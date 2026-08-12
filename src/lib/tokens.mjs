/**
 * Copy tokens: `{price}`, `{low}`, `{lowDate}` and friends, substituted from
 * facts read off the live page at record time.
 *
 * The reason this exists: an ad that says "Open it up." is describing the
 * software. An ad that says "$229.95. It was $199.95 in October." is making an
 * argument, and it is the argument that sells. But the moment copy asserts a
 * number it also asserts a fact, and a hardcoded fact rots — a profile here
 * once shipped the line "Thirteen reviews, one answer" and the site's data
 * moved on without it, so the ad was simply wrong and nothing caught it.
 *
 * So numbers are never written into a profile. They are extracted, and a line
 * that cannot be filled is DROPPED rather than printed with a hole in it. A
 * missing beat is invisible; "It was $undefined in October" is a disaster on a
 * client's timeline.
 */

const TOKEN = /\{(\w+)\}/g;

/**
 * Fills `{token}`s from `facts`. Returns null if any token is missing or empty,
 * which callers must treat as "drop this copy".
 */
export function fillTokens(text, facts) {
  if (typeof text !== 'string' || !text) return text ?? null;
  let missing = false;
  const out = text.replace(TOKEN, (_, k) => {
    const v = facts?.[k];
    if (v === undefined || v === null || v === '') { missing = true; return ''; }
    return String(v);
  });
  return missing ? null : out;
}

/**
 * True if the string needs facts at all.
 *
 * Deliberately NOT the `TOKEN` regex above. `.test()` on a `/g` regex advances
 * `lastIndex` and resumes from there on the next call, so sharing one instance
 * made this return true, false, true, false down a list of identical-looking
 * copy — every other claim in the reel silently lost its caption, including the
 * punchline.
 */
export function hasTokens(text) {
  return typeof text === 'string' && /\{\w+\}/.test(text);
}

/**
 * Fills a `{ kicker, title, subtitle }` block. The TITLE is load-bearing: if it
 * cannot be filled the whole block is dropped. A kicker or subtitle that fails
 * is merely removed, because the line still stands without it.
 */
export function fillCopy(copy, facts) {
  if (!copy) return copy;
  const title = fillTokens(copy.title, facts);
  if (copy.title && title === null) return null;
  const kicker = fillTokens(copy.kicker, facts);
  const subtitle = fillTokens(copy.subtitle, facts);
  return {
    ...copy,
    title: title ?? copy.title,
    kicker: kicker ?? '',
    subtitle: subtitle ?? '',
  };
}
