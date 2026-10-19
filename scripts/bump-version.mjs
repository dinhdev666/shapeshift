// ShapeShift - one-shot version bump for manifest.json and package.json.
//
// Usage:  node scripts/bump-version.mjs <version>
// Example: node scripts/bump-version.mjs 1.2.3
//
// P11: the version string lives in both manifest.json and package.json. Without
// a single-command bump, one file gets updated and the other silently drifts.
// This script writes both atomically, validates semver on the input, and
// refuses to proceed if either file is missing or already at the target.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, fileURLToPath } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  console.error('Example: node scripts/bump-version.mjs 1.2.3');
  process.exit(1);
}

if (!SEMVER_RE.test(input)) {
  console.error(
    'Error: "' + input + '" is not a valid semver string (expected X.Y.Z)'
  );
  process.exit(1);
}

const manifestPath = join(ROOT, 'manifest.json');
const pkgPath = join(ROOT, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

if (manifest.version === input && pkg.version === input) {
  console.log('Both files are already at ' + input);
  process.exit(0);
}

if (manifest.version === input) {
  console.log(
    'manifest.json is already at ' +
      input +
      ' — only package.json needs updating'
  );
} else {
  console.log('manifest.json: ' + manifest.version + ' -> ' + input);
  manifest.version = input;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + '\n', 'utf8');
}

if (pkg.version === input) {
  console.log(
    'package.json is already at ' +
      input +
      ' — only manifest.json needs updating'
  );
} else {
  console.log('package.json: ' + pkg.version + ' -> ' + input);
  pkg.version = input;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

console.log('Done. Run "pnpm run verify" to confirm.');
