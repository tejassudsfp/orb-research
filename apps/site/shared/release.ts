/**
 * The current macOS installer. The DMG is a release asset in a private repository, so nobody can download it
 * without a link: /api/download checks the emailed token, then redirects to a short-lived GitHub asset URL.
 * The public repository's release carries the notes, checksum and LGPL sources.
 */
export const RELEASE = {
  version: '0.1.0',
  arch: 'arm64',
  tag: 'v0.1.0',
  asset: 'orb-0.1.0-arm64.dmg',
  /** Private repository holding the installer assets (override with RELEASE_REPO). */
  repo: 'tejassudsfp/orb-releases',
  notes: 'https://github.com/tejassudsfp/orb-research/releases/tag/v0.1.0',
  sha256: '36ad8b2676655b45aec52707c016ba628da24ce5f8a0fb619f374fb25076b51b',
} as const;
