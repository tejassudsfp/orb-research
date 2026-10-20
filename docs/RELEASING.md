# Releasing orb

orb ships as a signed, notarised macOS DMG that visitors request by email at
[orb.tejassuds.com/download](https://orb.tejassuds.com/download) (Vercel). The DMG itself lives only in the private
`tejassudsfp/orb-releases` repository; the public [GitHub release](https://github.com/tejassudsfp/orb-research/releases)
carries the notes, the checksum and the LGPL sources. The source is MIT licensed to
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
`CHANGELOG.md` entry, and update the `RELEASE` constant (version, tag, asset name, notes URL, SHA-256) in
`apps/site/shared/release.ts`.

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

## 5. Publish the release

The installer goes to the **private** repository; the public release gets everything else.

```sh
# Private: the installer, served only through emailed links.
gh release create v<version> --repo tejassudsfp/orb-releases --title "orb <version>" \
  --notes "Installer assets for orb <version>." \
  release/dist/orb-<version>-arm64.dmg release/dist/orb-<version>-arm64.dmg.sha256

# Public: tag the reviewed commit, then publish the notes, checksum and LGPL sources.
git tag -a v<version> -m "orb <version>"
git push public v<version>
gh release create v<version> --repo tejassudsfp/orb-research --title "orb <version>" --notes-file <notes.md> \
  release/dist/orb-<version>-arm64.dmg.sha256 release/dist/orb-<version>-lgpl-sources.tar
```

The release notes link to orb.tejassuds.com/download and state the platform (Apple silicon, macOS 14+), the signing
identity, the checksum, and that research runs take time. Keep only the latest verified installer locally; DMGs are
never committed.

## 6. Deploy the website

The site deploys from this repository on Vercel:

| Setting | Value |
|---|---|
| Root Directory | `apps/site` (Vercel reads `apps/site/vercel.json` for install and build) |
| Build output | Vercel Build Output API (`apps/site/vercel/build-output.mjs`): static pages plus the `/api/bug-reports` Node function |
| Environment: `SITE_ORIGIN` | `https://orb.tejassuds.com` |
| Environment: `RESEND_API_KEY` | Server-only secret (sends from `orb@email.tejassuds.com`) |
| Environment: `DOWNLOAD_LINK_SECRET` | Server-only secret, at least 32 random bytes (`openssl rand -base64 48`). Signs emailed download links; rotating it invalidates links already sent |
| Environment: `GITHUB_RELEASE_TOKEN` | Fine-grained GitHub token: repository `tejassudsfp/orb-releases` only, permission Contents: Read-only |
| Environment: `RELEASE_REPO` | Optional; defaults to `tejassudsfp/orb-releases` |
| Environment: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Public PostHog project token and host |
| Environment: `ENABLE_EXPERIMENTAL_COREPACK` | `1` (uses the pinned pnpm from `packageManager`) |
| Domain | `orb.tejassuds.com` (CNAME to Vercel) |

**Downloads.** Download buttons open `/download`. A request (`/api/download-requests`) emails the visitor a personal
link from `orb@email.tejassuds.com` that works for 7 days, and emails `projects.tejassuds@gmail.com` their address, the
button they used and their country. Following the link (`/api/download`) checks its signature and expiry, emails
`projects.tejassuds@gmail.com` that this address downloaded (at most once a day per link), then redirects to a GitHub URL
for the private DMG that expires within minutes. A person can request a link 3 times per hour per email address and
10 times per hour per network address (`REQUESTS_PER_*` in `server/download-requests.ts`); following a link is not
limited. Limits are counted per function instance.

**Analytics.** PostHog loads only after a visitor accepts cookies. Then it records page views, `download_clicked`
(`version`, `arch`, `placement`: hero, faq or closing) and `download_requested`. Emails are never sent to PostHog.
The notification emails cover every request and download, including visitors who declined cookies. The private
release also counts downloads:
`gh api repos/tejassudsfp/orb-releases/releases/tags/v<version> -q '.assets[] | "\(.name) \(.download_count)"'`.

**Bug reports.** The bug-report function caps evidence at 3 MB per report, so a whole request stays under Vercel's
4.5 MB request-body limit. Its rate limits apply per function instance; use Vercel's firewall rules for
deployment-wide limits.

## Source archive

To produce a history-free archive of a reviewed commit:

```sh
mkdir -p release/source
git archive --format=tar.gz --prefix=orb/ HEAD -o release/source/orb-source.tar.gz
```
