import { fileURLToPath } from 'node:url';
import { createSiteServer } from './site.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid site port');
const server = createSiteServer({
  dist: fileURLToPath(new URL('../dist', import.meta.url)),
  bugReports: { getApiKey: () => process.env.RESEND_API_KEY, origin: process.env.SITE_ORIGIN },
});
server.listen(port, process.env.HOST ?? '0.0.0.0', () =>
  console.log(`Orb website listening on port ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
