import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDownloadRequestHandler } from './download-requests.js';

const header = (req: IncomingMessage, name: string) => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
};

/**
 * The Vercel Function behind `/api/download-requests` (built by vercel/build-output.mjs). Vercel sets `x-real-ip`
 * and `x-vercel-ip-country` itself, so both are safe to trust.
 */
const downloads = createDownloadRequestHandler({
  getApiKey: () => process.env.RESEND_API_KEY,
  getLinkSecret: () => process.env.DOWNLOAD_LINK_SECRET,
  origin: process.env.SITE_ORIGIN,
  clientIp: (req) => header(req, 'x-real-ip'),
  country: (req) => header(req, 'x-vercel-ip-country'),
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return downloads(req, res);
}
