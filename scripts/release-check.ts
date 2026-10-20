/** Public source guard. Reads Git's file list; never reads ignored research homes or Keychain. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
].filter((file) => existsSync(join(root, file)));
const failures: string[] = [];
const token =
  /(?:\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|\bre_[A-Za-z0-9_-]{24,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for (const file of files) {
  if (
    /^(?:\.orb-dev|release|node_modules|test-results|playwright-report)\//.test(file) ||
    /(?:^|\/)(?:\.env(?:\..+)?|board\.jsonl|sidecar\.log)$/.test(file) ||
    /\.(?:dmg|pem|key|p12|pfx)$/.test(file)
  )
    failures.push(`${file}: runtime data, credentials or generated release artifact`);
  const full = join(root, file);
  if (lstatSync(full).isSymbolicLink()) {
    failures.push(`${file}: review symbolic link before release`);
    continue;
  }
  const bytes = readFileSync(full);
  if (bytes.includes(0)) continue; // Binary screenshots/fonts have their own provenance/notices.
  const lines = bytes.toString('utf8').split('\n');
  for (let i = 0; i < lines.length; i++)
    if (token.test(lines[i]!)) failures.push(`${file}:${i + 1}: credential-like content (value redacted)`);
}
const publicDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'ROADMAP.md',
  'THIRD_PARTY_NOTICES.md',
  ...[
    'README',
    'PRODUCT_BRIEF',
    'GETTING_STARTED',
    'MODELS',
    'CHATGPT_PLAN',
    'PRIVACY',
    'THEMES',
    'ARCHITECTURE',
    'RELEASING',
    'PROGRESS',
    'ACCEPTANCE',
  ].map((name) => `docs/${name}.md`),
  'docs/images/README.md',
];
for (const file of publicDocs) {
  if (!existsSync(join(root, file))) {
    failures.push(`${file}: missing public documentation`);
    continue;
  }
  const text = readFileSync(join(root, file), 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1]!;
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]!);
    if (!existsSync(resolve(root, dirname(file), path)))
      failures.push(`${file}: broken local link ${target}`);
  }
}
const license = readFileSync(join(root, 'LICENSE'), 'utf8');
if (
  !license.includes('MIT License') ||
  !license.includes('Tejas Parthasarathi Sudarshan (https://tejassuds.com)')
)
  failures.push('LICENSE: missing requested MIT attribution');
for (const file of files.filter((f) =>
  /^(?:package\.json|(?:apps|packages|profiles)\/[^/]+\/package\.json)$/.test(f),
)) {
  const pkg = JSON.parse(readFileSync(join(root, file), 'utf8'));
  if (pkg.license !== 'MIT' || pkg.author?.url !== 'https://tejassuds.com')
    failures.push(`${file}: license/author metadata missing`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Public source check passed: ${files.length} files; documentation links, attribution and known credential/runtime patterns. Review history and images separately before publishing.`,
  );
