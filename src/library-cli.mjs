// node src/library-cli.mjs --reels [--out library/reels]
import { exportLibrary } from './library.mjs';
import { REELS_PROFILE } from './sites/bigticket-reels.mjs';
import { APP_PROFILE } from './sites/bigticket-app.mjs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const profile = flag('app') ? APP_PROFILE : REELS_PROFILE;
await exportLibrary(profile, {
  outDir: typeof flag('out') === 'string' ? flag('out') : 'library/reels',
  width: Number(flag('width')) || 540,
  height: Number(flag('height')) || 960,
});
