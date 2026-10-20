import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDownloadFileHandler } from './download-file.js';

/** The Vercel Function behind `/api/download` (built by vercel/build-output.mjs). */
const files = createDownloadFileHandler({
  getApiKey: () => process.env.RESEND_API_KEY,
  getLinkSecret: () => process.env.DOWNLOAD_LINK_SECRET,
  getGithubToken: () => process.env.GITHUB_RELEASE_TOKEN,
  repo: process.env.RELEASE_REPO,
  country: (req) => {
    const value = req.headers['x-vercel-ip-country'];
    return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
  },
});

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return files(req, res);
}
