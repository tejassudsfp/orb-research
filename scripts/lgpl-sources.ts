/**
 * Collect the corresponding source for the LGPL native libraries the macOS installer redistributes (the libvips
 * bundle from @img/sharp-libvips-darwin-arm64, THIRD_PARTY_NOTICES.md "Native binary distribution"), and pack it as a
 * release asset next to the DMG: release/dist/orb-<version>-lgpl-sources.tar.
 *
 * Contents: each LGPL component's upstream source tarball at the exact version in versions.json, the patches the
 * sharp-libvips build applies, and the sharp-libvips build scripts at the matching tag, which rebuild the bundle.
 *
 *   pnpm exec tsx scripts/lgpl-sources.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// The workspace hoists node_modules (.npmrc node-linker=hoisted); the package does not export package.json.
const pkgDir = resolve(root, 'node_modules/@img/sharp-libvips-darwin-arm64');
const bundle = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8')) as { version: string };
const v = JSON.parse(readFileSync(resolve(pkgDir, 'versions.json'), 'utf8')) as Record<string, string>;
const { version } = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8')) as { version: string };

const minor = (x: string) => x.split('.').slice(0, 2).join('.');
const tag = `v${bundle.version}`;

// LGPL components in the bundle, with the URLs sharp-libvips build/posix.sh downloads (at tag above).
const sources: Array<[name: string, license: string, url: string]> = [
  ['vips', 'LGPL-2.1-or-later', `https://github.com/libvips/libvips/releases/download/v${v.vips}/vips-${v.vips}.tar.xz`],
  ['glib', 'LGPL-2.1-or-later', `https://download.gnome.org/sources/glib/${minor(v.glib!)}/glib-${v.glib}.tar.xz`],
  ['proxy-libintl', 'LGPL-2.1-or-later', `https://github.com/frida/proxy-libintl/archive/${v['proxy-libintl']}.tar.gz`],
  ['pango', 'LGPL-2.0-or-later', `https://download.gnome.org/sources/pango/${minor(v.pango!)}/pango-${v.pango}.tar.xz`],
  ['cairo', 'LGPL-2.1-only OR MPL-1.1', `https://cairographics.org/releases/cairo-${v.cairo}.tar.xz`],
  ['fribidi', 'LGPL-2.1-or-later', `https://github.com/fribidi/fribidi/releases/download/v${v.fribidi}/fribidi-${v.fribidi}.tar.xz`],
  ['librsvg', 'LGPL-2.1-or-later', `https://download.gnome.org/sources/librsvg/${minor(v.rsvg!)}/librsvg-${v.rsvg}.tar.xz`],
  ['libheif', 'LGPL-3.0-or-later', `https://github.com/strukturag/libheif/releases/download/v${v.heif}/libheif-${v.heif}.tar.gz`],
  ['libexif', 'LGPL-2.1-or-later', `https://github.com/libexif/libexif/releases/download/v${v.exif}/libexif-${v.exif}.tar.xz`],
];
const patches: Array<[name: string, url: string]> = [
  ['glib-without-gregex.patch', 'https://gist.github.com/kleisauke/284d685efa00908da99ea6afbaaf39ae/raw/bdad5489a61c217850631571caf57f5db6ea8b2c/glib-without-gregex.patch'],
  ['librsvg-9106011.patch', 'https://github.com/GNOME/librsvg/commit/9106011db93d701728ac2c9da50c9ab2c1bb5dc6.patch'],
  ['libvips-cpp-soversion.patch', 'https://gist.githubusercontent.com/lovell/313a6901e9db1bf285f2a1f1180499e4/raw/3988223c7dfa4d22745d9392034b0117abef1446/libvips-cpp-soversion.patch'],
];

const out = resolve(root, `release/lgpl-sources/orb-${version}-lgpl-sources`);
mkdirSync(resolve(out, 'sources'), { recursive: true });
mkdirSync(resolve(out, 'patches'), { recursive: true });
const fetchTo = (url: string, file: string) => {
  console.log(`fetch ${url}`);
  execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', '-o', file, url]);
};
for (const [name, , url] of sources) fetchTo(url, resolve(out, 'sources', `${name}-${url.split('/').pop()}`));
for (const [name, url] of patches) fetchTo(url, resolve(out, 'patches', name));
fetchTo(`https://github.com/lovell/sharp-libvips/archive/refs/tags/${tag}.tar.gz`, resolve(out, `sharp-libvips-${tag}.tar.gz`));

writeFileSync(
  resolve(out, 'README.txt'),
  [
    `orb ${version}: corresponding source for LGPL libraries in the macOS installer`,
    '',
    `The installer redistributes @img/sharp-libvips-darwin-arm64 ${bundle.version} (inside orb.app/Contents/Resources/`,
    'node_modules/@img/). Its LGPL components are listed below; their upstream source is in sources/, the patches the',
    `build applies are in patches/, and the build scripts that produce the bundle are in sharp-libvips-${tag}.tar.gz`,
    '(build/posix.sh, versions.properties). Rebuild with those scripts, then replace the dylibs in the app bundle and',
    're-sign it (codesign --force --deep --sign -) to run your modified libraries.',
    '',
    ...sources.map(([name, license, url]) => `- ${name} (${license}): ${url}`),
    '',
    'Full versions of every library in the bundle (versions.json):',
    JSON.stringify(v, null, 2),
    '',
  ].join('\n'),
);
const tarball = resolve(root, `release/dist/orb-${version}-lgpl-sources.tar`);
mkdirSync(dirname(tarball), { recursive: true });
execFileSync('tar', ['-cf', tarball, '-C', dirname(out), `orb-${version}-lgpl-sources`]);
console.log(`wrote ${tarball}`);
