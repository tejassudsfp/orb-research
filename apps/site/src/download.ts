import { track } from './analytics.js';

/** The current macOS installer: the signed and notarised DMG attached to the GitHub release. */
export const RELEASE = {
  version: '0.1.0',
  arch: 'arm64',
  url: 'https://github.com/tejassudsfp/orb-research/releases/download/v0.1.0/orb-0.1.0-arm64.dmg',
  notes: 'https://github.com/tejassudsfp/orb-research/releases/tag/v0.1.0',
} as const;

/**
 * Every `[data-download]` link points at the installer in the HTML itself, so downloading works without scripts.
 * With analytics accepted, a click also records `download_clicked` and where on the page it came from.
 */
export function setupDownloads() {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-download]')) {
    link.href = RELEASE.url;
    link.addEventListener('click', () =>
      track('download_clicked', {
        version: RELEASE.version,
        arch: RELEASE.arch,
        placement: link.dataset.download || 'unknown',
      }),
    );
  }
}
