/**
 * The egress audit's logging proxy: HTTP CONNECT tunnels and absolute-form HTTP forwarding, on 127.0.0.1.
 * Every request is recorded (host, port, how it arrived, what the proxy did with it). Only allowed hosts are
 * passed on; anything else is answered `403` so an audit run never lets it leave the machine.
 *
 * `routes` maps a virtual host name to a local target: the deterministic audit gives the mock LLM a
 * non-loopback name (`mock-llm.orb.test`) because dsh never proxies loopback
 * (node_modules/@deepseek-ai/dsh-http-proxy/lib/index.js `LOOPBACK_NO_PROXY`), so the model traffic must be
 * addressed to a name only this proxy can resolve. `forward` lists real hosts passed through unchanged (live
 * mode: `api.openai.com`).
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

export type ProxyHit = {
  at: number;
  /** `connect`: a CONNECT tunnel (https, or http when undici tunnels); `forward`: an absolute-form request. */
  via: 'connect' | 'forward';
  host: string;
  port: number;
  method: string;
  /** Path of a forwarded request (a tunnel's path is inside TLS and not visible). */
  path?: string;
  decision: 'routed' | 'forwarded' | 'refused';
};

export type EgressProxyOptions = {
  /** Virtual host → local target. Matched on the host name, any port. */
  routes?: Record<string, { host: string; port: number }>;
  /** Real hosts passed through unchanged. */
  forward?: string[];
  /**
   * P3.5 live Scout audit only: pass EVERY host through (recorded), because the hosts Scout will fetch are not
   * known in advance; the audit then judges each hit against the URLs the session fetched.
   */
  forwardAll?: boolean;
};

export class EgressProxy {
  readonly hits: ProxyHit[] = [];
  private server?: Server;
  private readonly sockets = new Set<Socket | Duplex>();
  private readonly routes: Map<string, { host: string; port: number }>;
  private readonly forward: Set<string>;
  private readonly forwardAll: boolean;
  private port = 0;

  constructor(options: EgressProxyOptions = {}) {
    this.routes = new Map(Object.entries(options.routes ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.forward = new Set((options.forward ?? []).map((h) => h.toLowerCase()));
    this.forwardAll = options.forwardAll === true;
  }

  /** `http://127.0.0.1:<port>`: the value for HTTP(S)_PROXY. */
  get url(): string {
    if (!this.server) throw new Error('egress proxy: not started');
    return `http://127.0.0.1:${this.port}`;
  }

  get listenPort(): number {
    return this.port;
  }

  async start(): Promise<this> {
    const server = createServer((req, res) => this.onRequest(req, res));
    server.on('connect', (req, socket, head) => this.onConnect(req, socket, head));
    server.on('connection', (s) => this.track(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.server = server;
    this.port = (server.address() as AddressInfo).port;
    return this;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    for (const s of this.sockets) s.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private track<T extends Socket | Duplex>(s: T): T {
    this.sockets.add(s);
    s.on('close', () => this.sockets.delete(s));
    s.on('error', () => {});
    return s;
  }

  /** Where a request for `host:port` goes, or undefined when it is refused. */
  private target(
    host: string,
    port: number,
  ): { host: string; port: number; decision: ProxyHit['decision'] } | undefined {
    const name = host.toLowerCase();
    const route = this.routes.get(name);
    if (route) return { ...route, decision: 'routed' };
    if (this.forward.has(name) || this.forwardAll) return { host: name, port, decision: 'forwarded' };
    return undefined;
  }

  private onConnect(req: IncomingMessage, client: Duplex, head: Buffer) {
    this.track(client);
    const { host, port } = splitAuthority(req.url ?? '', 443);
    const target = this.target(host, port);
    this.hits.push({
      at: Date.now(),
      via: 'connect',
      host,
      port,
      method: 'CONNECT',
      decision: target?.decision ?? 'refused',
    });
    if (!target) {
      client.end('HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
      return;
    }
    const upstream = this.track(netConnect(target.port, target.host));
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n'));
    client.once('close', () => upstream.destroy());
  }

  private onRequest(req: IncomingMessage, res: ServerResponse) {
    let url: URL;
    try {
      url = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const target = url.protocol === 'http:' ? this.target(url.hostname, port) : undefined;
    this.hits.push({
      at: Date.now(),
      via: 'forward',
      host: url.hostname,
      port,
      method: req.method ?? 'GET',
      path: url.pathname,
      decision: target?.decision ?? 'refused',
    });
    if (!target) {
      res.writeHead(403, { 'content-length': '0', connection: 'close' }).end();
      return;
    }
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const upstream = httpRequest(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  }
}

function splitAuthority(authority: string, defaultPort: number): { host: string; port: number } {
  const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority) ?? /^([^:]+)(?::(\d+))?$/.exec(authority);
  if (!m) return { host: authority, port: defaultPort };
  return { host: m[1]!.toLowerCase(), port: m[2] ? Number(m[2]) : defaultPort };
}
