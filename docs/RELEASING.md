# Releasing orb

orb ships as a signed, notarised macOS DMG on [GitHub Releases](https://github.com/tejassudsfp/orb-research/releases), with a
marketing site at [orb.tejassuds.com](https://orb.tejassuds.com) on Vercel. The source is MIT licensed to
Tejas Parthasarathi Sudarshan (https://tejassuds.com). Installers are signed with the Developer ID of
Fanpit Technologies Private Limited (Team ID `Q78J7L8TLR`).

## 1. Check the source

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm release:check
pnpm egress-audit --mode deterministic
```

`release:check` scans the tracked source for credential patterns, forbidden runtime artifacts, license attribution
and broken local documentation links. It does not read ignored user research. Also run a maintained secret scanner
(for example Gitleaks) over the history you are about to publish, and review the results privately.

## 2. Bump the version

Update `version` in `apps/desktop/package.json` (the installer reads it) and `apps/site/package.json`, add a
`CHANGELOG.md` entry, and update the `RELEASE` constant in `apps/site/src/download.ts` plus the download links in
`apps/site/index.html` and `README.md`.

## 3. Build, sign and notarise the DMG

One-time setup on the release Mac:
- The **Developer ID Application** certificate (with its private key) is in the login Keychain:
  `security find-identity -v -p codesigning`.
- A notarytool credential profile exists. Create it once in Terminal (it prompts for an app-specific password from
  appleid.apple.com):

  ```sh
  xcrun notarytool store-credentials orb-notary --apple-id <apple-id-email> --team-id Q78J7L8TLR
  ```

Then build:

```sh
APPLE_KEYCHAIN_PROFILE=orb-notary pnpm release:mac
```

`release:mac` runs `pnpm dist`, which does the following:
1. builds the app;
2. stages it (`scripts/dist-stage.ts`);
3. signs the app and every native addon with the hardened runtime (`apps/desktop/build/entitlements.mac.plist`:
   JIT only, library validation on);
4. has electron-builder notarise and staple the app.

`pnpm notarize-dmg` then submits the DMG itself, staples and validates the ticket, runs Gatekeeper's assessment and
writes `release/dist/orb-<version>-arm64.dmg.sha256`.

Verify the exact artifact you will upload:

```sh
pnpm e2e:packaged
spctl --assess --type execute --verbose=2 release/dist/mac-arm64/orb.app
xcrun stapler validate release/dist/orb-<version>-arm64.dmg
```

`pnpm dist:adhoc` makes a local, ad-hoc signed build (no certificate, no notarisation) for development.

## 4. Collect the LGPL sources

```sh
pnpm exec tsx scripts/lgpl-sources.ts
```

This writes `release/dist/orb-<version>-lgpl-sources.tar`: the corresponding source for the LGPL libraries in the
libvips bundle. It is attached to every release; see [third-party notices](../THIRD_PARTY_NOTICES.md#native-binary-distribution).

## 5. Publish the GitHub release

```sh
git tag -a v<version> -m "orb <version>"
git push origin v<version>
gh release create v<version> \
  release/dist/orb-<version>-arm64.dmg \
  release/dist/orb-<version>-arm64.dmg.sha256 \
  release/dist/orb-<version>-lgpl-sources.tar \
  --title "orb <version>" --notes-file <notes.md>
```

The release notes state the platform (Apple silicon, macOS 14+), the signing identity, the checksum, and that research
runs take time. Keep only the latest verified installer locally; DMGs are never committed.

## 6. Deploy the website

The site deploys from this repository on Vercel:

| Setting | Value |
|---|---|
| Root Directory | `apps/site` (Vercel reads `apps/site/vercel.json` for install and build) |
| Build output | Vercel Build Output API (`apps/site/vercel/build-output.mjs`): static pages plus the `/api/bug-reports` Node function |
| Environment: `SITE_ORIGIN` | `https://orb.tejassuds.com` |
| Environment: `RESEND_API_KEY` | Server-only secret |
| Environment: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Public PostHog project token and host |
| Environment: `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the pinned pnpm from `packageManager`) |
| Domain | `orb.tejassuds.com` (CNAME to Vercel) |

**Analytics.** PostHog loads only after a visitor accepts cookies. Then it records page views and `download_clicked`
events (`version`, `arch`, `placement`: hero, faq or closing). GitHub's own download counts cover every download,
including visitors who declined cookies:
`gh api repos/tejassudsfp/orb-research/releases/tags/v<version> -q '.assets[] | "\(.name) \(.download_count)"'`.

**Bug reports.** The bug-report function caps evidence at 3 MB per report, so a whole request stays under Vercel's
4.5 MB request-body limit. Its rate limits apply per function instance; use Vercel's firewall rules for
deployment-wide limits.

## Source archive

To produce a history-free archive of a reviewed commit:

```sh
mkdir -p release/source
git archive --format=tar.gz --prefix=orb/ HEAD -o release/source/orb-source.tar.gz
```
