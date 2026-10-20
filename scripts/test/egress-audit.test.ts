/**
 * P1.11 egress audit (Gate 1). The deterministic audit must pass: a real sidecar, one prompt, one place_card
 * call, and no host contacted but the (mock) model host. The telemetry-on run is the negative control: with
 * telemetry left on and a message rated, the audit must SEE the upload attempt (and block it). Plus fast unit
 * checks of the two observers (logging proxy, socket monitor preload).
 */
import { execFile } from 'node:child_process';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MOCK_MODEL_HOST, MOCK_SITE_HOST, PARALLEL_HOST, TELEMETRY_HOST, formatReport, judgeFetchHits, judgeParallelHits, runEgressAudit } from '../egress/audit.ts';
import { EgressProxy } from '../egress/proxy.ts';

const MONITOR = resolve(import.meta.dirname, '..', 'egress', 'monitor.cjs');

describe('egress audit (deterministic)', () => {
  it('passes: only the model host, and the mock site for exactly the URLs Scout fetched, are contacted', async () => {
    const report = await runEgressAudit({ mode: 'deterministic' });
    expect(report.invalid, formatReport(report)).toEqual([]);
    expect(report.violations, formatReport(report)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.session.cardPlaced).toBe(true);
    expect(report.session.modelRequests).toBeGreaterThanOrEqual(2);
    expect(report.monitor.processes).toBeGreaterThanOrEqual(1);
    // P3.5: Scout searched (through the search provider on the model host), fetched the results, a redirecting URL
    // and a missing page, and placed a source card.
    const site = (path: string) => `http://${MOCK_SITE_HOST}${path}`;
    expect(report.session.scout).toEqual({
      searches: 1,
      sourceCard: true,
      fetched: [site('/article'), site('/missing'), site('/moved'), site('/old'), site('/report.pdf')],
    });
    // Every non-loopback host anyone saw is the model host or the fetched site, all through the proxy; the site was
    // asked only for those URLs (page 2 or a second read would come from the cache).
    // P6.7: plus the mock `api.parallel.ai`, through the proxy, for REST calls only (web_search runs on Parallel Search).
    expect(report.hosts.map((h) => h.host).sort()).toEqual([PARALLEL_HOST, MOCK_MODEL_HOST, MOCK_SITE_HOST].sort());
    expect(report.proxyHits.every((h) => h.decision === 'routed')).toBe(true);
    expect(report.proxyHits.some((h) => h.path === '/v1/chat/completions')).toBe(true);
    expect(report.proxyHits.some((h) => h.host === PARALLEL_HOST && h.path === '/v1/search')).toBe(true);
    expect(report.proxyHits.filter((h) => h.host === PARALLEL_HOST).every((h) => h.via === 'forward' && /^\/v1(beta)?\//.test(h.path ?? ''))).toBe(true);
    expect(report.session.parallel).toEqual({
      researchCard: true,
      calls: expect.arrayContaining([
        'POST /v1/search',
        'POST /v1/extract',
        'POST /v1/responses',
        'POST /v1beta/findall/entity-search',
        'POST /v1/tasks/runs',
        'GET /v1/tasks/runs/trun_N/events',
      ]),
    });
    expect(report.proxyHits.filter((h) => h.host === MOCK_SITE_HOST).map((h) => h.path)).toEqual([
      '/article',
      '/report.pdf',
      '/old',
      '/moved',
      '/missing',
    ]);
    // No DNS lookup and no direct socket for the site: the proxy resolved it (undici names the target when it
    // dials the proxy, so the loopback connect to the proxy carries the site's name).
    const siteRecords = report.monitor.records.filter((r) => r.host === MOCK_SITE_HOST);
    expect(siteRecords.every((r) => r.kind === 'connect' && r.loopback)).toBe(true);
  }, 120_000);

  it('judges fetch hits: a URL the session did not fetch, or another host, is a violation', () => {
    const hit = (host: string, path: string, via: 'forward' | 'connect' = 'forward', port = via === 'forward' ? 80 : 443) => ({
      at: 0,
      via,
      host,
      port,
      method: via === 'forward' ? 'GET' : 'CONNECT',
      ...(via === 'forward' ? { path } : {}),
      decision: 'routed' as const,
    });
    const fetched = ['http://site.test/a', 'https://secure.test/doc'];
    const ok = judgeFetchHits([hit(MOCK_MODEL_HOST, '/v1/x'), hit('site.test', '/a'), hit('secure.test', '', 'connect')], fetched, MOCK_MODEL_HOST);
    expect(ok.violations).toEqual([]);
    expect([...ok.hosts].sort()).toEqual(['secure.test', 'site.test']);
    const bad = judgeFetchHits([hit('site.test', '/a'), hit('site.test', '/secret'), hit('other.test', '', 'connect')], fetched, MOCK_MODEL_HOST);
    expect(bad.violations).toEqual([
      'site.test: proxy forward :80 /secret was not a URL the session fetched',
      'other.test: proxy connect :443 was not a URL the session fetched',
    ]);
    expect(bad.hosts.size).toBe(0);
  });
});

describe('egress audit: Parallel hits', () => {
  const hit = (host: string, path: string | undefined, via: 'forward' | 'connect' = 'forward', decision: 'routed' | 'refused' | 'forwarded' = 'routed') => ({
    at: 0,
    via,
    host,
    port: 80,
    method: via === 'forward' ? 'POST' : 'CONNECT',
    ...(path !== undefined ? { path } : {}),
    decision,
  });
  it('allows routed REST calls under /v1 and /v1beta on api.parallel.ai only', () => {
    expect(judgeParallelHits([hit(PARALLEL_HOST, '/v1/search'), hit(PARALLEL_HOST, '/v1beta/findall/runs'), hit('other.test', '/x')]).violations).toEqual([]);
    const bad = judgeParallelHits([hit(PARALLEL_HOST, '/account/service/v1/balance'), hit(PARALLEL_HOST, undefined, 'connect'), hit(PARALLEL_HOST, '/v1/search', 'forward', 'refused')]);
    expect(bad.violations).toHaveLength(3);
  });
});

describe('egress audit (telemetry left on)', () => {
  it('sees the telemetry upload attempt and blocks it', async () => {
    const report = await runEgressAudit({ mode: 'telemetry' });
    expect(report.invalid, formatReport(report)).toEqual([]);
    expect(report.session.feedback).toBe('recorded');
    expect(report.telemetryAttempts.length, formatReport(report)).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
    expect(report.violations.some((v) => v.startsWith(TELEMETRY_HOST))).toBe(true);
    // The OTLP exporter goes direct (node:http, not the proxy), and the monitor refused it.
    const telemetry = report.monitor.records.filter((r) => r.host === TELEMETRY_HOST);
    expect(telemetry.length).toBeGreaterThan(0);
    expect(telemetry.every((r) => r.blocked)).toBe(true);
    expect(report.proxyHits.some((h) => h.host === TELEMETRY_HOST)).toBe(false);
  }, 120_000);
});

describe('egress proxy', () => {
  const closers: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const c of closers) await c();
  });

  it('routes a virtual host to its local target, refuses and records every other host', async () => {
    const target = createServer((req, res) => res.end(`ok ${req.url}`));
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    closers.push(() => new Promise((r) => target.close(() => r())));
    const proxy = await new EgressProxy({
      routes: { 'virtual.orb.test': { host: '127.0.0.1', port: (target.address() as AddressInfo).port } },
    }).start();
    closers.push(() => proxy.close());

    const viaProxy = (url: string) =>
      new Promise<{ status: number; body: string }>((resolveRes, reject) => {
        const port = Number(new URL(proxy.url).port);
        const req = request({ host: '127.0.0.1', port, path: url, method: 'GET' }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolveRes({ status: res.statusCode ?? 0, body }));
        });
        req.on('error', reject);
        req.end();
      });
    expect(await viaProxy('http://virtual.orb.test/v1/x')).toEqual({ status: 200, body: 'ok /v1/x' });
    expect((await viaProxy('http://example.com/')).status).toBe(403);
    expect(proxy.hits.map((h) => [h.host, h.decision])).toEqual([
      ['virtual.orb.test', 'routed'],
      ['example.com', 'refused'],
    ]);
  });
});

describe('egress monitor preload', () => {
  it('records and refuses direct non-loopback connects and DNS, lets loopback through', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orb-egress-monitor-'));
    const log = join(dir, 'monitor.jsonl');
    try {
      const script = `
        const net = require('node:net');
        const server = net.createServer((s) => s.end()).listen(0, '127.0.0.1', async () => {
          const port = server.address().port;
          const tryConnect = (opts) => new Promise((r) => {
            const s = net.connect(opts);
            s.on('connect', () => { s.destroy(); r('connected'); });
            s.on('error', (e) => r(e.code));
          });
          const out = {
            loopback: await tryConnect({ host: '127.0.0.1', port }),
            literal: await tryConnect({ host: '192.0.2.1', port: 80 }),
            name: await tryConnect({ host: 'egress-canary.orb.test', port: 443 }),
          };
          console.log(JSON.stringify(out));
          server.close();
        });`;
      const stdout = await new Promise<string>((resolveOut, reject) =>
        execFile(
          process.execPath,
          ['-e', script],
          {
            env: {
              ...process.env,
              NODE_OPTIONS: `--require "${MONITOR}"`,
              ORB_EGRESS_MONITOR_LOG: log,
              ORB_EGRESS_ENFORCE: '1',
              ORB_EGRESS_ALLOW_HOSTS: 'model.orb.test',
            },
            timeout: 20_000,
          },
          (err, out) => (err ? reject(err) : resolveOut(out)),
        ),
      );
      expect(JSON.parse(stdout)).toEqual({
        loopback: 'connected',
        literal: 'ECONNREFUSED',
        name: 'ENOTFOUND',
      });
      const records = readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      expect(records[0]).toMatchObject({ kind: 'hello' });
      expect(records).toContainEqual(
        expect.objectContaining({ kind: 'connect', host: '192.0.2.1', blocked: true }),
      );
      expect(records).toContainEqual(
        expect.objectContaining({ kind: 'dns', host: 'egress-canary.orb.test', blocked: true }),
      );
      expect(records).toContainEqual(
        expect.objectContaining({ kind: 'connect', address: '127.0.0.1', loopback: true, blocked: false }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
