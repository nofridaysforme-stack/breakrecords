// Fails on (1) em or en dashes anywhere under src/ and (2) hard-coded hex
// colors outside src/styles/tokens.css. Album art may opt out of the hex
// rule with a `lint-allow-hex` comment on the same line.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Scans the web app and every workspace package (apps/web/scripts -> repo root).
const repo = new URL('../../..', import.meta.url).pathname;
const root = repo;
const src = join(repo, 'apps', 'web', 'src');
const packages = join(repo, 'packages');
const exts = /\.(tsx?|css|mjs|js|json|md)$/;
const tokenFile = join(src, 'styles', 'tokens.css');
const hex = /#[0-9a-fA-F]{3,8}\b/;
const dash = /[—–]/;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.test(name)) files.push(p);
  }
})(src);
for (const pkg of readdirSync(packages)) {
  const dir = join(packages, pkg, 'src');
  try { if (statSync(dir).isDirectory()) (function walk(d) { for (const name of readdirSync(d)) { const p = join(d, name); if (statSync(p).isDirectory()) walk(p); else if (exts.test(name)) files.push(p); } })(dir); } catch { /* no src */ }
}

const problems = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const where = `${relative(root, file)}:${i + 1}`;
    if (dash.test(line)) problems.push(`${where}  em or en dash: ${line.trim()}`);
    if (file !== tokenFile && hex.test(line) && !line.includes('lint-allow-hex')) {
      problems.push(`${where}  hard-coded hex (use a token): ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`lint:copy ok (${files.length} files)`);
