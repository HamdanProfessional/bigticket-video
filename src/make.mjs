#!/usr/bin/env node
// CLI entry point — a thin wrapper over the library in ./index.mjs, so the CLI
// and the programmatic API cannot drift apart.
//
//   node src/make.mjs "a warm soft ad about saving to boards"
//   node src/make.mjs "punchy 12s ad about prices" --format vertical
//   node src/make.mjs "..." --seed 7 --mood premium --fast
//   node src/make.mjs "..." --storyboard-only
//   node src/make.mjs --batch prompts.txt

import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { makeVideo } from './index.mjs';
import { APP_PROFILE } from './sites/bigticket-app.mjs';
import { REELS_PROFILE } from './sites/bigticket-reels.mjs';

const argv = process.argv.slice(2);
const BOOL = new Set(['storyboard-only', 'no-music', 'keep-frames', 'fast', 'app', 'reels']);

const flag = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  if (BOOL.has(name)) return true;
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};

// Whatever is neither a flag nor a flag's value is prompt text.
const consumed = new Set();
argv.forEach((a, i) => {
  if (!a.startsWith('--')) return;
  consumed.add(i);
  const name = a.slice(2);
  if (!BOOL.has(name) && argv[i + 1] && !argv[i + 1].startsWith('--')) consumed.add(i + 1);
});
const prompt = argv.filter((_, i) => !consumed.has(i)).join(' ').trim();

const num = (v) => (v == null || v === true ? undefined : Number(v));
const opts = {
  seed: num(flag('seed')),
  duration: num(flag('duration')),
  fps: num(flag('fps')),
  mood: flag('mood') || undefined,
  // editorial | kinetic | panel. Omitted, the director picks one.
  captionStyle: flag('style') || undefined,
  format: flag('format') || undefined,
  url: flag('url') || undefined,
  // Pin every card to one finish. Left off, the director deals them from a
  // shuffled bag so a single film shows several.
  panelStyle: flag('panel') || undefined,
  storyboardOnly: !!flag('storyboard-only'),
  music: !flag('no-music'),
  keepFrames: !!flag('keep-frames'),
  fast: !!flag('fast'),
  // Film the signed-in app across its routes instead of the marketing page.
  // Needs BT_EMAIL / BT_PASSWORD in the environment.
  // --reels is the element-level Instagram profile: tight vertical shots on
  // single elements, with real clicks.
  profile: flag('reels') ? REELS_PROFILE : flag('app') ? APP_PROFILE : undefined,
};
// A profile can insist on a format — the reels components are 44px-tall
// elements, which have no business being framed across a 1440px landscape.
if (opts.profile?.defaultFormat && !flag('format')) opts.format = opts.profile.defaultFormat;

const batch = flag('batch');
const prompts = batch && typeof batch === 'string'
  ? (await readFile(batch, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : (prompt ? [prompt] : []);

if (!prompts.length) {
  console.error(
    'usage: node src/make.mjs "<prompt>" [--format landscape|vertical|square]\n' +
    '                          [--seed N] [--duration S] [--mood calm|premium|energetic|playful]\n' +
    '                          [--panel ink|brand|paper|glass] [--app]\n' +
    '                          [--fast] [--storyboard-only] [--no-music] [--keep-frames]\n' +
    '       node src/make.mjs --batch prompts.txt'
  );
  process.exit(1);
}

await mkdir('out', { recursive: true });

let ok = 0;
for (const p of prompts) {
  try {
    const res = await makeVideo({
      ...opts,
      prompt: p,
      onProgress: (f, total) => {
        if (f % 15 === 0) process.stdout.write(`\r  recording ${f}/${total} frames  `);
      },
    });
    const sb = res.storyboard;
    console.log(`\n▸ ${p}`);
    console.log(`  seed ${sb.seed}  mood ${sb.mood}  ${sb.format} ${sb.outWidth}x${sb.outHeight}  ~${sb.duration}s  ${sb.shots.length} shots`);
    console.log(`  ${sb.shots.map((s) => `${s.component}:${s.kind}`).join(' → ')}`);
    if (sb.routes && sb.routes.length > 1) console.log(`  routes ${sb.routes.join(' · ')}`);
    console.log(`  music ${sb.music.key} ${sb.music.scale} @ ${sb.music.tempo}bpm`);
    console.log(opts.storyboardOnly
      ? `  storyboard → ${path.join(res.outDir, 'storyboard.json')}`
      : `  ✓ ${res.outPath}`);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${p}: ${e.message}`);
  }
}
console.log(`\nDone. ${ok}/${prompts.length} video(s) in ./out`);
