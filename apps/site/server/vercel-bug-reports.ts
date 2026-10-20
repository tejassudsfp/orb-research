import type { IncomingMessage, ServerResponse } from 'node:http';
import { createBugReportHandler } from './bug-reports.js';

/**
 * The Vercel Function behind `/api/bug-reports` (built by vercel/build-output.mjs). Vercel overwrites `x-real-ip`
 * with the connecting client's address, so it is safe to trust for the per-visitor rate limit.
 */
const reports = createBugReportHandler({
  getApiKey: () => process.env.RESEND_API_KEY,
  origin: process.env.SITE_ORIGIN,
  clientIp: (req) => {
    const value = req.headers['x-real-ip'];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  },
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return reports(req, res);
}
