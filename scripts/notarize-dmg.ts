/**
 * Notarise, staple and verify the release DMG, then write its SHA-256 checksum file.
 *
 * electron-builder already signs and notarises the app inside the DMG (electron-builder.yml, APPLE_KEYCHAIN_PROFILE),
 * but leaves the DMG container unsigned. This step signs the DMG with the same Developer ID, notarises it, staples
 * the ticket so it verifies offline, and runs Gatekeeper's checks.
 *
 *   APPLE_KEYCHAIN_PROFILE=orb-notary pnpm exec tsx scripts/notarize-dmg.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')) as { version: string };
const dmg = resolve(root, `release/dist/orb-${version}-arm64.dmg`);
const identity = 'Developer ID Application: Fanpit Technologies Private Limited (Q78J7L8TLR)';
const profile = process.env.APPLE_KEYCHAIN_PROFILE;
if (!profile) throw new Error('Set APPLE_KEYCHAIN_PROFILE to a stored notarytool profile (see docs/RELEASING.md).');

const run = (cmd: string, args: string[]) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
};

run('codesign', ['--force', '--sign', identity, '--timestamp', dmg]);
run('codesign', ['--verify', '--strict', '--verbose=2', dmg]);
run('xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', profile, '--wait']);
run('xcrun', ['stapler', 'staple', dmg]);
run('xcrun', ['stapler', 'validate', dmg]);
run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);

const sum = createHash('sha256').update(readFileSync(dmg)).digest('hex');
writeFileSync(`${dmg}.sha256`, `${sum}  ${basename(dmg)}\n`);
console.log(`SHA-256 ${sum}  ${basename(dmg)}`);
