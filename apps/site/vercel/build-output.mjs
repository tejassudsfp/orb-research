// Writes the site in Vercel's Build Output API v3 layout (https://vercel.com/docs/build-output-api/v3) after
// `vite build`: the static pages, one Node function for /api/bug-reports, and the routes the Node server
// (server/site.ts) applies locally. Run through `pnpm --filter @orb/site build:vercel`.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const site = resolve(import.meta.dirname, '..');
const out = resolve(site, '.vercel/output');
const fn = resolve(out, 'functions/api/bug-reports.func');

rmSync(out, { recursive: true, force: true });
cpSync(resolve(site, 'dist'), resolve(out, 'static'), { recursive: true });

mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [resolve(site, 'server/vercel-bug-reports.ts')],
  outfile: resolve(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});
writeFileSync(
  resolve(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);

const headers = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
writeFileSync(
  resolve(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(security|report-a-bug)/$', status: 308, headers: { Location: '/$1' } },
        { src: '^/(.*)$', headers, continue: true },
        { handle: 'filesystem' },
        { src: '^/security$', dest: '/security.html' },
        { src: '^/report-a-bug$', dest: '/report-a-bug.html' },
      ],
    },
    null,
    2,
  ),
);
process.stdout.write(`Vercel output written to ${out}\n`);
