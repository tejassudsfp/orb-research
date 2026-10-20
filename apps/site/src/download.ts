import { track } from './analytics.js';
import { RELEASE } from '../shared/release.js';

/**
 * Every `[data-download]` link opens /download, where the visitor asks for the download link by email. With
 * analytics accepted, a click also records `download_clicked` and where on the page it came from.
 */
export function setupDownloads() {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-download]')) {
    const placement = link.dataset.download || 'unknown';
    link.href = `/download?from=${encodeURIComponent(placement)}`;
    link.addEventListener('click', () =>
      track('download_clicked', { version: RELEASE.version, arch: RELEASE.arch, placement }),
    );
  }
}
