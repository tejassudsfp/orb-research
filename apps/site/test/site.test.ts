import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createSiteServer } from '../server/site.js';
let server: Server | undefined;
let temp: string | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  if (temp) await rm(temp, { recursive: true, force: true });
});
it('serves both support routes while keeping backend files and paths outside the public build inaccessible', async () => {
  temp = await mkdtemp(join(tmpdir(), 'orb-site-'));
  const dist = join(temp, 'dist');
  await mkdir(dist);
  for (const [file, content] of [
    ['index.html', 'Home'],
    ['security.html', 'Keychain and local storage'],
    ['report-a-bug.html', 'Bug form'],
  ])
    await writeFile(join(dist, file!), content!);
  await writeFile(join(temp, 'private.txt'), 'not public');
  server = createSiteServer({ dist, bugReports: { getApiKey: () => undefined } });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  expect(await (await fetch(base + '/security')).text()).toBe('Keychain and local storage');
  expect(await (await fetch(base + '/report-a-bug')).text()).toBe('Bug form');
  expect((await fetch(base + '/security/', { redirect: 'manual' })).status).toBe(308);
  expect((await fetch(base + '/..%2fprivate.txt')).status).toBe(403);
  expect((await fetch(base + '/server/start.ts')).status).toBe(404);
  expect((await fetch(base + '/.env.local')).status).toBe(404);
});
