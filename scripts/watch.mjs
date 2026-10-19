// P9: Development watch mode for ShapeShift.
//
// Watches the runtime tree (core/, content/, background/, popup/, options/,
// manifest.json, _locales/, images/) for changes and rebuilds dist/ on
// debounce. Run `pnpm run dev` during development to avoid manually
// reloading the extension on every edit.
import { watch, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, fileURLToPath } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WATCH_DIRS = [
  'core',
  'content',
  'background',
  'popup',
  'options',
  'images',
  '_locales',
];
const WATCH_FILES = ['manifest.json', 'package.json'];

const watchPaths = WATCH_DIRS.filter((d) => existsSync(join(ROOT, d))).map(
  (d) => join(ROOT, d)
);
WATCH_FILES.forEach((f) => {
  const p = join(ROOT, f);
  if (existsSync(p)) watchPaths.push(p);
});

if (watchPaths.length === 0) {
  console.error('No source paths found to watch.');
  process.exit(1);
}

let pending = false;
let timer = null;

function rebuild() {
  if (pending) {
    // Debounce: another change is already queued.
    clearTimeout(timer);
    timer = setTimeout(doRebuild, 300);
    return;
  }
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(doRebuild, 300);
}

function doRebuild() {
  pending = false;
  const child = spawn(process.execPath, ['scripts/build.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('close', (code) => {
    if (code === 0) {
      console.log(
        '[' +
          new Date().toISOString() +
          '] Rebuilt dist/ — reload chrome://extensions'
      );
    } else {
      console.error(
        '[' + new Date().toISOString() + '] Build failed (exit ' + code + ')'
      );
    }
  });
}

function isRuntimePath(path) {
  // Skip dist/ and node_modules/ so rebuilds do not cascade.
  if (path.includes('dist/') || path.includes('node_modules/')) return false;
  return true;
}

console.log('ShapeShift dev watch — watching: ' + watchPaths.length + ' paths');
console.log(
  'Edit a file, then reload the unpacked extension in chrome://extensions.'
);
console.log('First build:');
doRebuild();

watchPaths.forEach((dir) => {
  try {
    watch(dir, { recursive: true }, (event, filename) => {
      if (!isRuntimePath(filename || dir)) return;
      rebuild();
    });
  } catch (e) {
    // On some Node versions recursive watching of a directory with subdirectories
    // throws; fall back to non-recursive.
    watch(dir, (event, filename) => {
      if (!isRuntimePath(filename || dir)) return;
      rebuild();
    });
  }
});
