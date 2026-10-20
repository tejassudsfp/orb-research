import type { IncomingMessage, ServerResponse } from 'node:http';
import { emailError, PLACEMENT_PATTERN } from '../shared/download-request.js';
import { RELEASE } from '../shared/release.js';
import { createLinkToken } from './download-links.js';
import {
  assertSiteRequest,
  clientIp,
  HttpError,
  rateLimiter,
  reply,
  sendMail,
  SITE_SENDER,
  UUID_PATTERN,
  type Mail,
  type MailOptions,
} from './http.js';

/** Every download request is reported here, with the visitor's email. Replies to the link email land here too. */
export const DOWNLOAD_NOTIFY = 'projects.tejassuds@gmail.com';
const MAX_BODY = 4 * 1024;
const HOUR = 60 * 60 * 1000;
/**
 * How often a person can ask for a download link, per hour: by email address, and by network address (higher, so
 * people sharing an office or home network do not block each other). Following a link is not limited.
 */
export const REQUESTS_PER_EMAIL_PER_HOUR = 3;
export const REQUESTS_PER_IP_PER_HOUR = 10;
/** A site-wide ceiling per server instance, against scripted floods of the email endpoint. */
const REQUESTS_PER_HOUR = 300;
const GETTING_STARTED = 'https://github.com/tejassudsfp/orb-research/blob/main/docs/GETTING_STARTED.md';

export type DownloadRequestOptions = MailOptions & {
  /** Signs the emailed download links (DOWNLOAD_LINK_SECRET); /api/download verifies them with the same secret. */
  getLinkSecret: () => string | undefined;
  /** The visitor's country code for the owner notification (Vercel: x-vercel-ip-country). */
  country?: (req: IncomingMessage) => string | undefined;
  now?: () => Date;
};

type DownloadRequest = { requestId: string; email: string; placement: string };

async function readRequest(req: IncomingMessage): Promise<DownloadRequest> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Use the download form to request a link.');
  if (Number(req.headers['content-length']) > MAX_BODY) throw new HttpError(413, 'That request is too large.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    bytes += part.length;
    if (bytes > MAX_BODY) throw new HttpError(413, 'That request is too large.');
    chunks.push(part);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Refresh the page and try again.');
  }
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'Refresh the page and try again.');
  // The hidden "website" field is a bot trap; people never see or fill it.
  if (body.website) throw new HttpError(422, 'The request could not be sent.');
  const { requestId, email, placement } = body;
  if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId))
    throw new HttpError(422, 'Refresh the page and try again.');
  if (typeof email !== 'string') throw new HttpError(422, 'Enter a valid email address.');
  const trimmed = email.trim();
  const invalid = emailError(trimmed);
  if (invalid) throw new HttpError(422, invalid);
  const where = typeof placement === 'string' && PLACEMENT_PATTERN.test(placement) ? placement : 'direct';
  return { requestId, email: trimmed, placement: where };
}

export function linkMail(email: string, link: string): Mail {
  const text = [
    'Hi,',
    '',
    `Thanks for trying orb. Here is your download for orb ${RELEASE.version}:`,
    link,
    '',
    'This link is just for you and works for 7 days. After that, request a new one at https://orb.tejassuds.com/download.',
    '',
    '- For Apple silicon Macs (M1 or later) running macOS 14 or later.',
    '- Signed and notarised by Apple.',
    `- SHA-256: ${RELEASE.sha256}`,
    '',
    'Install: open the DMG, drag orb to Applications, then add a model key or connect an eligible ChatGPT plan in',
    'Settings > Models.',
    '',
    'A note on time: research in orb is thorough rather than instant. The agents read, compare and check sources, so',
    'a run can take several minutes or longer. You can watch the board fill in and steer it as it goes.',
    '',
    `Getting started: ${GETTING_STARTED}`,
    `Release notes: ${RELEASE.notes}`,
    '',
    'Questions or feedback? Just reply to this email.',
    '',
    'orb · https://orb.tejassuds.com',
    '',
    'You received this because this address asked for an orb download link at orb.tejassuds.com. It is used to send',
    "this link and shared with orb's maintainer, who may reply. You will not be added to a mailing list.",
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#11171d">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7eb">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:1px;color:#2563eb;font-weight:600">ORB ${RELEASE.version}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">Your download is ready.</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">Thanks for trying orb, a research workspace where AI agents build a board of sources, comparisons and questions with you.</p>
<p style="margin:0 0 8px"><a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">Download orb for Mac</a></p>
<p style="margin:0 0 24px;font-size:12px;color:#6b7280">This link is just for you and works for 7 days.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5">For Apple silicon Macs on macOS 14 or later. Signed and notarised by Apple. Open the DMG, drag orb to Applications, then add a model key or connect an eligible ChatGPT plan in Settings &gt; Models.</p>
<p style="margin:16px 0 8px;font-size:14px;line-height:1.5"><strong>Research takes time.</strong> The agents read, compare and check sources, so a run can take several minutes or longer. Watch the board fill in and steer it as it goes.</p>
<p style="margin:16px 0 0;font-size:14px;line-height:1.5"><a href="${GETTING_STARTED}" style="color:#2563eb">Getting started</a> · <a href="${RELEASE.notes}" style="color:#2563eb">Release notes</a> · Reply to this email with questions.</p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280">SHA-256 ${RELEASE.sha256}<br>You received this because this address asked for an orb download link at orb.tejassuds.com. It is used to send this link and shared with orb's maintainer. You will not be added to a mailing list.</p>
</div></body></html>`;
  return {
    from: `orb <${SITE_SENDER}>`,
    to: [email],
    reply_to: DOWNLOAD_NOTIFY,
    subject: `Your orb ${RELEASE.version} download link`,
    text,
    html,
  };
}

export function notifyMail(request: DownloadRequest, at: Date, country: string | undefined): Mail {
  return {
    from: `orb downloads <${SITE_SENDER}>`,
    to: [DOWNLOAD_NOTIFY],
    reply_to: request.email,
    subject: `[orb download] ${request.email}`,
    text: [
      'Someone requested the orb download link. You will get another email when they download it.',
      '',
      `Email: ${request.email}`,
      `Version: ${RELEASE.version} (${RELEASE.arch})`,
      `From: the ${request.placement} download button`,
      `Country: ${country || 'Unknown'}`,
      `Time (UTC): ${at.toISOString()}`,
      `Reference: ${request.requestId}`,
      '',
      'Reply to this email to write to them directly.',
    ].join('\n'),
  };
}

export function createDownloadRequestHandler(options: DownloadRequestOptions) {
  const byVisitor = rateLimiter({ perKey: REQUESTS_PER_IP_PER_HOUR, global: REQUESTS_PER_HOUR, windowMs: HOUR });
  const byEmail = rateLimiter({
    perKey: REQUESTS_PER_EMAIL_PER_HOUR,
    global: Number.MAX_SAFE_INTEGER,
    windowMs: HOUR,
  });
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== 'POST') res.setHeader('allow', 'POST');
      assertSiteRequest(req, options, 'download');
      const ip = clientIp(req, options);
      if (!byVisitor.allows(ip)) {
        res.setHeader('retry-after', '3600');
        throw new HttpError(429, 'Too many download requests from this network. Please try again in an hour.');
      }
      const apiKey = await options.getApiKey();
      const secret = options.getLinkSecret();
      if (!apiKey || !secret)
        throw new HttpError(503, 'Download emails are temporarily unavailable. Please try again soon.');
      const request = await readRequest(req);
      const address = request.email.toLowerCase();
      if (!byEmail.allows(address)) {
        res.setHeader('retry-after', '3600');
        throw new HttpError(
          429,
          'We already sent links to this address in the last hour. Check your inbox and spam folder, or try again later.',
        );
      }
      byVisitor.record(ip);
      byEmail.record(address);
      const key = `orb-download/${request.requestId}`;
      // assertSiteRequest accepted this Origin as the site's own, so links point back at the same site.
      const token = createLinkToken(secret, { email: request.email, requestId: request.requestId });
      const link = `${req.headers.origin}/api/download?token=${token}`;
      if (!(await sendMail(options, apiKey, linkMail(request.email, link), `${key}/link`)))
        throw new HttpError(502, 'We could not send the email. Check the address and try again.');
      // The visitor has their link either way; a failed notification must not turn their request into an error.
      await sendMail(
        options,
        apiKey,
        notifyMail(request, options.now?.() ?? new Date(), options.country?.(req)),
        `${key}/notify`,
      ).catch(() => false);
      reply(res, 201, { requestId: request.requestId });
    } catch (error) {
      // Never return provider errors, keys or email bodies to the browser or logs.
      reply(res, error instanceof HttpError ? error.status : 502, {
        error:
          error instanceof HttpError ? error.message : 'We could not send the email. Please try again.',
      });
    }
  };
}
