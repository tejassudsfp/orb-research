import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createBugReportHandler, type BugReportOptions } from './bug-reports.js';

export function createSiteHandler(options: { dist: string; bugReports: BugReportOptions }) {
  const reports = createBugReportHandler(options.bugReports);
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
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }
    if (path === '/security/' || path === '/report-a-bug/') {
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
            path === '/'
              ? '/index.html'
              : path === '/security'
                ? '/security.html'
                : path === '/report-a-bug'
                  ? '/report-a-bug.html'
                  : path,
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
