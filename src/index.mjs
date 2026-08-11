// Public API.
//
//   import { makeVideo, FORMATS } from 'bigticket-video';
//
//   await makeVideo({ prompt: 'a warm soft ad about boards', format: 'vertical' });
//
// The four stages are also exported individually, so a caller can stop after
// the storyboard, swap the renderer, or score an edit produced elsewhere.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { direct } from './director.mjs';
import { record } from './record.mjs';
import { renderVideo, renderPoster, run } from './render.mjs';
import { credentialsFromEnv } from './auth.mjs';

export { direct } from './director.mjs';
export { record } from './record.mjs';
export { renderVideo, renderPoster } from './render.mjs';
export { FORMATS } from './director.mjs';
export { COMPONENTS, AFFINITY, KINDS, KIND_NAMES, fitZoom, frameOn } from './shotlib.mjs';
export { login, ensureSession, credentialsFromEnv } from './auth.mjs';
export { APP_PROFILE } from './sites/bigticket-app.mjs';
export { makeRng, hashString } from './lib/rng.mjs';
export { EASINGS, ease, tween } from './lib/easing.mjs';

// Resolve alongside this module so the library works from any cwd.
const MUSIC_PY = fileURLToPath(new URL('./music.py', import.meta.url));

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'video';

/**
 * Prompt in, finished MP4 out.
 *
 * @param {object}   o
 * @param {string}   o.prompt        Drives mood, length, cast, motion and music.
 * @param {string}  [o.format]       'landscape' | 'vertical' | 'square' (or an
 *                                   alias like 'mobile'/'reel'). Inferred from
 *                                   the prompt when omitted.
 * @param {number}  [o.seed]         Pin a variant. Defaults to a hash of the prompt.
 * @param {number}  [o.duration]     Seconds. Defaults to ad length (18s).
 * @param {string}  [o.mood]         Force 'calm'|'premium'|'energetic'|'playful'.
 * @param {string}  [o.url]          Page to film.
 * @param {string}  [o.outDir]       Defaults to out/<slug>[-format]-<seed>.
 * @param {boolean} [o.fast]         Preview quality: ~4x quicker, visibly softer.
 * @param {boolean} [o.music]        Set false to skip scoring.
 * @param {boolean} [o.keepFrames]   Keep the frame sequence on disk.
 * @param {object}  [o.components]   Site profile override — see COMPONENTS.
 * @param {object}  [o.affinity]     Which motion kinds suit which component.
 * @param {Array}   [o.topics]       Prompt keyword → component rules.
 * @param {Array}   [o.spine]        Default narrative order.
 * @param {Function}[o.onProgress]   (frame, total) during capture.
 * @returns {Promise<{outPath,posterPath,audioPath,outDir,storyboard,manifest}>}
 */
export async function makeVideo(o = {}) {
  if (!o.prompt) throw new Error('makeVideo: `prompt` is required');

  // A profile bundles components/affinity/topics/spine/hook/signoff for a
  // site; explicit options still win over it.
  const P = o.profile || {};
  const pick = (k) => o[k] ?? P[k];

  const storyboard = direct(o.prompt, {
    seed: o.seed,
    duration: o.duration,
    mood: o.mood,
    format: o.format,
    fps: o.fps,
    components: pick('components'),
    affinity: pick('affinity'),
    topics: pick('topics'),
    spine: pick('spine'),
    filler: pick('filler'),
    panelStyle: o.panelStyle,
    hook: pick('hook'),
    signoff: pick('signoff'),
    cards: o.cards,
  });
  storyboard.url = o.url || 'https://shopbigticket.com/';
  storyboard.fast = !!o.fast;
  // Where a component with no route of its own is filmed.
  storyboard.defaultRoute = pick('defaultRoute') || '/';
  // Which routes the film touches — useful in the storyboard without a render.
  storyboard.routes = [...new Set(storyboard.shots.map(
    (s) => (pick('components') || {})[s.component]?.route || storyboard.defaultRoute
  ))];

  const suffix = storyboard.format === 'landscape' ? '' : `-${storyboard.format}`;
  const name = `${slug(o.prompt)}${suffix}-${storyboard.seed.toString(16).slice(0, 6)}`;
  const outDir = o.outDir || path.join('out', name);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'storyboard.json'), JSON.stringify(storyboard, null, 2));

  if (o.storyboardOnly) return { outDir, storyboard, manifest: null, outPath: null };

  // Credentials are never stored on the storyboard or the manifest — they are
  // handed straight to the recorder and used once to mint a session.
  const auth = (pick('requiresAuth') || o.auth) ? (o.auth || credentialsFromEnv()) : null;
  if (pick('requiresAuth') && !auth) {
    throw new Error(
      'This profile films the signed-in app, so it needs credentials. ' +
      'Set BT_EMAIL and BT_PASSWORD in the environment.'
    );
  }

  const manifest = await record(storyboard, outDir, {
    onProgress: o.onProgress,
    components: pick('components'),
    auth,
  });

  let audioPath = null;
  if (o.music !== false) {
    const specPath = path.join(outDir, 'music.json');
    audioPath = path.join(outDir, 'score.wav');
    // Score against the RECORDED duration — a component that failed to resolve
    // drops its shot, so the storyboard's length is only an intention.
    await writeFile(
      specPath,
      JSON.stringify(
        { ...storyboard.music, duration: manifest.duration, cuts: manifest.shots.map((s) => s.end) },
        null, 2
      )
    );
    await run(process.platform === 'win32' ? 'python' : 'python3', [
      MUSIC_PY,
      specPath, audioPath,
    ]);
  }

  const outPath = path.join(outDir, `${name}.mp4`);
  await renderVideo({
    framesDir: manifest.framesDir,
    audioPath,
    outPath,
    fps: manifest.fps,
    duration: manifest.duration,
    outWidth: manifest.outWidth,
    outHeight: manifest.outHeight,
    grade: manifest.look?.grade ?? 1,
  });

  const sharpShot = manifest.shots
    .filter((s) => !['rackFocus', 'whipTo'].includes(s.kind))
    .sort((a, b) => b.duration - a.duration)[0] || manifest.shots[0];
  const posterPath = path.join(outDir, 'poster.jpg');
  await renderPoster({
    framesDir: manifest.framesDir,
    outPath: posterPath,
    frameIndex: Math.min(
      manifest.frameCount - 1,
      Math.floor((sharpShot.start + sharpShot.duration * 0.72) * manifest.fps)
    ),
  });

  if (!o.keepFrames) await rm(manifest.framesDir, { recursive: true, force: true });
  return { outDir, outPath, posterPath, audioPath, storyboard, manifest };
}

/** Storyboard only — no browser, no render. Useful for iterating on an edit. */
export function planVideo(prompt, opts = {}) {
  return direct(prompt, opts);
}
