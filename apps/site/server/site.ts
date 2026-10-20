import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createBugReportHandler, type BugReportOptions } from './bug-reports.js';
import { createDownloadFileHandler, type DownloadFileOptions } from './download-file.js';
import { createDownloadRequestHandler, type DownloadRequestOptions } from './download-requests.js';

/** Pretty page routes and the HTML file each serves. */
export const PAGES: Record<string, string> = {
  '/security': '/security.html',
  '/report-a-bug': '/report-a-bug.html',
  '/download': '/download.html',
};

export function createSiteHandler(options: {
  dist: string;
  bugReports: BugReportOptions;
  downloadRequests: DownloadRequestOptions;
  downloads: DownloadFileOptions;
}) {
  const reports = createBugReportHandler(options.bugReports);
  const requests = createDownloadRequestHandler(options.downloadRequests);
  const files = createDownloadFileHandler(options.downloads);
  const root = resolve(options.dist);
  const mime: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
  };
  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/api/bug-reports') return reports(req, res);
    if (path === '/api/download-requests') return requests(req, res);
    if (path === '/api/download') return files(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }
    if (path.endsWith('/') && PAGES[path.slice(0, -1)]) {
      res.writeHead(308, { location: path.slice(0, -1) });
      res.end();
      return;
    }
    let file: string;
    try {
      file = resolve(
        root,
        '.' +
          decodeURIComponent(
            path === '/' ? '/index.html' : (PAGES[path] ?? path),
          ),
      );
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        'content-type': mime[extname(file)] ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Page not found');
    }
  };
}

export function createSiteServer(options: Parameters<typeof createSiteHandler>[0]) {
  return createServer({ requestTimeout: 30000, headersTimeout: 15000 }, createSiteHandler(options));
}
