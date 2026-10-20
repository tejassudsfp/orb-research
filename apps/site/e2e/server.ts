/** Local-only test fixture: no Keychain reads and no real email requests. */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createSiteHandler } from '../server/site.js';
let deliveries: Array<{ payload: unknown; idempotency: string | null }> = [];
let failNext = false;
function handler() {
  return createSiteHandler({
    dist: resolve(import.meta.dirname, '../../../.orb-dev/site-test-build'),
    bugReports: {
      getApiKey: () => 'test-only-server-credential',
      fetch: async (_url, init) => {
        deliveries.push({
          payload: JSON.parse(String(init!.body)),
          idempotency: new Headers(init!.headers).get('idempotency-key'),
        });
        if (failNext) {
          failNext = false;
          return Response.json({ error: 'synthetic delivery failure' }, { status: 503 });
        }
        return Response.json({ id: 'synthetic-resend-id' });
      },
    },
  });
}
let serve = handler();
const server = createServer((req, res) => {
  if (req.url === '/__test/mail') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(deliveries));
    return;
  }
  if (req.url === '/__test/reset' && req.method === 'POST') {
    deliveries = [];
    failNext = false;
    serve = handler();
    res.end('reset');
    return;
  }
  if (req.url === '/__test/fail-next' && req.method === 'POST') {
    failNext = true;
    res.end('ready');
    return;
  }
  void serve(req, res);
});
server.listen(4179, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
