# Third-party notices

orb's own code and documentation are [MIT licensed](LICENSE). Dependencies keep their original licenses.

| Component | Source / notice |
| --- | --- |
| Symplist theme and accent system | [Symplist](https://github.com/tejassudsfp/symplist), MIT; [retained notice](apps/ui/public/licenses/symplist.txt) |
| Bundled theme fonts | [Font notices and SIL Open Font License texts](apps/ui/src/theme/fonts/LICENSES.txt) |
| Geist and Geist Mono static faces | Fontsource packages `@fontsource/geist` and `@fontsource/geist-mono`; SIL Open Font License 1.1 |
| DeepSeek Harness | `@deepseek-ai/dsh` and its packages; inspect the pinned packages' license files |
| Electron / Chromium / Node.js | Electron's `LICENSE` and `LICENSES.chromium.html` accompany the runtime |
| Other runtime dependencies | Their package manifests and accompanying license/notice files are retained when staged |
| Website analytics | `posthog-js` (Apache-2.0 AND MIT), website only; original license bundled under `licenses/posthog.txt` in the site output |

`pnpm dist:stage` stages the production dependency closure, retaining each package's license files. It also
includes orb's license, these notices, Symplist's notice and font license texts under `Resources/licenses`.
The generated dependency inventory in that directory records the installed versions and declared licenses;
it is an inventory, rather than a replacement for the original license texts. Review it when updating dependencies.

Using a provider or a website remains subject to that service's terms. The MIT License grants rights to orb's
software; it does not grant provider credits, subscriptions, trademark rights or rights to imported research.

## Native binary distribution

The macOS installer includes `@img/sharp-libvips-darwin-arm64` 1.3.4 (libvips 8.18.7 and its embedded native
libraries; versions in its `versions.json`). Several of those libraries are LGPL: libvips, GLib, proxy-libintl,
Pango, cairo (LGPL-2.1 or MPL-1.1), FriBidi, librsvg, libheif and libexif. They are shipped as separate dynamic
libraries in `orb.app/Contents/Resources/node_modules/@img/`, and they are not relicensed by orb's MIT notice.

**Corresponding source.** Every GitHub release attaches `orb-<version>-lgpl-sources.tar`. It contains each LGPL
component's upstream source at the shipped version, the patches the build applies, and the
[sharp-libvips](https://github.com/lovell/sharp-libvips) build scripts at the matching tag, which rebuild the bundle.
`scripts/lgpl-sources.ts` produces it. To run modified libraries, rebuild them, replace the dylibs in the app bundle
and re-sign the app locally.

**LibreOffice.** The installer does not include the LibreOffice engine (`@deepseek-ai/libreoffice-kit-darwin-arm64`,
MPL-2.0), because orb disables the plugin that uses it. The small `@deepseek-ai/libreoffice-kit` JavaScript entry
(MPL-2.0, shipped in source form) remains as a harness dependency.
