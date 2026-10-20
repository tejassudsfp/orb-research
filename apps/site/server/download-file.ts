import type { IncomingMessage, ServerResponse } from 'node:http';
import { RELEASE } from '../shared/release.js';
import { verifyLinkToken, type LinkClaims } from './download-links.js';
import { DOWNLOAD_NOTIFY } from './download-requests.js';
import { sendMail, SITE_SENDER, type Mail, type MailOptions } from './http.js';

export type DownloadFileOptions = MailOptions & {
  getLinkSecret: () => string | undefined;
  /** A fine-grained GitHub token with read-only Contents access to the private release repository. */
  getGithubToken: () => string | undefined;
  /** owner/name of the private repository holding the installer (default RELEASE.repo). */
  repo?: string;
  country?: (req: IncomingMessage) => string | undefined;
  now?: () => Date;
};

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  res.end();
}

export function downloadedMail(claims: LinkClaims, at: Date, country: string | undefined): Mail {
  return {
    from: `orb downloads <${SITE_SENDER}>`,
    to: [DOWNLOAD_NOTIFY],
    reply_to: claims.email,
    subject: `[orb downloaded] ${claims.email}`,
    text: [
      'Someone downloaded orb.',
      '',
      `Email: ${claims.email}`,
      `Version: ${RELEASE.version} (${RELEASE.arch})`,
      `Country: ${country || 'Unknown'}`,
      `Time (UTC): ${at.toISOString()}`,
      `Reference: ${claims.requestId}`,
      '',
      'Reply to this email to write to them directly.',
    ].join('\n'),
  };
}

/**
 * GET /api/download?token=… : check the emailed token, then redirect to a short-lived URL for the private release
 * asset. GitHub answers an authenticated asset request with a redirect to a signed download URL that expires in
 * minutes, so the installer never passes through this function and its permanent location stays private.
 */
export function createDownloadFileHandler(options: DownloadFileOptions) {
  const repo = options.repo || RELEASE.repo;
  let cachedAsset: { url: string; until: number } | undefined;

  async function assetApiUrl(token: string) {
    if (cachedAsset && cachedAsset.until > Date.now()) return cachedAsset.url;
    const response = await (options.fetch ?? globalThis.fetch)(
      `https://api.github.com/repos/${repo}/releases/tags/${RELEASE.tag}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'orb-site',
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return undefined;
    const release = (await response.json()) as { assets?: Array<{ name?: unknown; url?: unknown }> };
    const asset = release.assets?.find((item) => item.name === RELEASE.asset);
    if (typeof asset?.url !== 'string') return undefined;
    cachedAsset = { url: asset.url, until: Date.now() + 10 * 60 * 1000 };
    return asset.url;
  }

  async function signedAssetUrl(token: string) {
    const url = await assetApiUrl(token);
    if (!url) return undefined;
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/octet-stream',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'orb-site',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const location = response.headers.get('location');
    await response.body?.cancel();
    return response.status >= 300 && response.status < 400 && location?.startsWith('https://') ? location : undefined;
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const token = new URL(req.url ?? '/', 'http://orb.invalid').searchParams.get('token') ?? '';
      const secret = options.getLinkSecret();
      const claims = secret ? verifyLinkToken(secret, token, (options.now?.() ?? new Date()).getTime()) : undefined;
      if (!claims) return redirect(res, '/download?expired=1');
      const githubToken = options.getGithubToken();
      const location = githubToken ? await signedAssetUrl(githubToken) : undefined;
      if (!location) return redirect(res, '/download?unavailable=1');
      if (req.method === 'GET') {
        const apiKey = await options.getApiKey();
        // Resend keeps idempotency keys for 24 hours, so repeated clicks on one link notify at most once a day.
        if (apiKey)
          await sendMail(
            options,
            apiKey,
            downloadedMail(claims, options.now?.() ?? new Date(), options.country?.(req)),
            `orb-download/${claims.requestId}/downloaded`,
          ).catch(() => false);
      }
      redirect(res, location);
    } catch {
      // Never expose tokens, GitHub responses or provider errors.
      redirect(res, '/download?unavailable=1');
    }
  };
}
