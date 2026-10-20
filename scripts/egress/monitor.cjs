/* eslint-disable */
/**
 * Egress monitor: a preload (`NODE_OPTIONS=--require <this file>`) loaded into the sidecar by
 * scripts/egress-audit.ts. It records every outbound socket and every DNS query the process makes, at the
 * socket layer, so it also sees traffic that never reaches the audit proxy. dsh's proxy policy only covers
 * undici/fetch; dsh-session-telemetry-otel posts through `node:http` and goes direct by design
 * (node_modules/@deepseek-ai/dsh-http-proxy/README.md, "Telemetry is direct by design").
 *
 * Records go as JSON lines to $ORB_EGRESS_MONITOR_LOG (appendFileSync, so nothing is lost on SIGKILL).
 * With $ORB_EGRESS_ENFORCE=1 a non-loopback connect or a DNS query for a host not in $ORB_EGRESS_ALLOW_HOSTS is
 * refused after it is recorded, so an audit run never lets the attempt leave the machine.
 *
 * Plain CommonJS on purpose: it must load under Electron-as-Node with no build step. Inert without the env var.
 */
'use strict';

const LOG = process.env.ORB_EGRESS_MONITOR_LOG;
if (LOG) install(LOG);

function install(logPath) {
  const fs = require('node:fs');
  const net = require('node:net');
  const dns = require('node:dns');
  const dgram = require('node:dgram');

  const allowHosts = new Set(
    (process.env.ORB_EGRESS_ALLOW_HOSTS || '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
  const enforce = process.env.ORB_EGRESS_ENFORCE === '1';

  function record(entry) {
    try {
      fs.appendFileSync(logPath, JSON.stringify({ pid: process.pid, at: Date.now(), ...entry }) + '\n');
    } catch {
      // never break the host process
    }
  }

  function isLoopback(host) {
    if (!host) return true; // net defaults to localhost
    let h = String(host).toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0' || h === '::') return true;
    if (h.startsWith('::ffff:')) h = h.slice(7);
    return /^127\.\d+\.\d+\.\d+$/.test(h);
  }

  const allowed = (host) => isLoopback(host) || allowHosts.has(String(host).toLowerCase());

  function blockedError(what) {
    const err = new Error(`orb egress audit: blocked ${what}`);
    err.code = 'ECONNREFUSED';
    return err;
  }

  record({ kind: 'hello', argv: process.argv.slice(1, 2), node: process.versions.node });

  // ---- TCP / TLS: every client socket goes through Socket.prototype.connect ----
  // The decision is made on the ADDRESS actually dialled, not the host name: undici dials an IP literal while
  // passing the target's name as `host` plus a custom `lookup` that returns the IP
  // (node_modules/undici/lib/core/connect.js). So the hook wraps `lookup` and checks what it resolves to.
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function orbEgressConnect(...args) {
    let opts = args[0];
    if (Array.isArray(opts)) {
      // Internal callers pass the normalized [options, cb] array.
      opts = opts[0];
    }
    if (!opts || typeof opts !== 'object') {
      if (typeof opts === 'number' || (typeof opts === 'string' && /^\d+$/.test(opts))) {
        const cb = args.find((a) => typeof a === 'function');
        const options = { port: Number(opts), host: typeof args[1] === 'string' ? args[1] : 'localhost' };
        return orbEgressConnect.call(this, options, ...(cb ? [cb] : []));
      }
      return connect.apply(this, args); // IPC path
    }
    if (opts.path) return connect.apply(this, args); // IPC (unix socket): local by definition
    const socket = this;
    const host = opts.host || 'localhost';
    const port = Number(opts.port);
    const decide = (address) => {
      const loopback = isLoopback(address);
      const block = enforce && !loopback;
      record({
        kind: 'connect',
        host: String(host),
        address: String(address),
        port,
        loopback,
        allowed: allowed(host),
        blocked: block,
      });
      return block;
    };
    if (net.isIP(String(host).replace(/^\[|\]$/g, ''))) {
      if (decide(host)) {
        process.nextTick(() => socket.destroy(blockedError(`direct connect to ${host}:${port}`)));
        return socket;
      }
      return connect.apply(this, args);
    }
    const inner = typeof opts.lookup === 'function' ? opts.lookup : (...a) => dns.lookup(...a);
    opts.lookup = function orbEgressSocketLookup(hostname, lookupOptions, cb) {
      if (typeof lookupOptions === 'function') {
        cb = lookupOptions;
        lookupOptions = {};
      }
      inner(hostname, lookupOptions, (err, address, family) => {
        if (err) return cb(err, address, family);
        const list = Array.isArray(address) ? address.map((a) => a.address) : [address];
        const blocked = list.map(decide).some(Boolean);
        if (blocked) return cb(blockedError(`direct connect to ${host} (${list.join(', ')}):${port}`));
        cb(null, address, family);
      });
    };
    return connect.apply(this, args);
  };

  // ---- DNS ----
  function wrapCallbackLookup(owner, name) {
    const original = owner[name];
    if (typeof original !== 'function') return;
    owner[name] = function orbEgressLookup(hostname, ...rest) {
      const ok = allowed(hostname);
      const block = enforce && !ok;
      record({
        kind: 'dns',
        fn: name,
        host: String(hostname),
        loopback: isLoopback(hostname),
        allowed: ok,
        blocked: block,
      });
      if (block) {
        const cb = rest.findLast((a) => typeof a === 'function');
        const err = new Error(`orb egress audit: blocked DNS ${name} ${hostname}`);
        err.code = 'ENOTFOUND';
        err.hostname = hostname;
        if (cb) process.nextTick(cb, err);
        return {};
      }
      return original.call(this, hostname, ...rest);
    };
  }
  function wrapPromiseLookup(owner, name) {
    const original = owner[name];
    if (typeof original !== 'function') return;
    owner[name] = function orbEgressLookupP(hostname, ...rest) {
      const ok = allowed(hostname);
      const block = enforce && !ok;
      record({
        kind: 'dns',
        fn: `promises.${name}`,
        host: String(hostname),
        loopback: isLoopback(hostname),
        allowed: ok,
        blocked: block,
      });
      if (block) {
        const err = new Error(`orb egress audit: blocked DNS ${name} ${hostname}`);
        err.code = 'ENOTFOUND';
        return Promise.reject(err);
      }
      return original.call(this, hostname, ...rest);
    };
  }
  const RESOLVE = [
    'lookup',
    'resolve',
    'resolve4',
    'resolve6',
    'resolveAny',
    'resolveCname',
    'resolveTxt',
    'resolveSrv',
  ];
  for (const fn of RESOLVE) {
    wrapCallbackLookup(dns, fn);
    if (dns.Resolver) wrapCallbackLookup(dns.Resolver.prototype, fn);
    if (dns.promises) {
      wrapPromiseLookup(dns.promises, fn);
      if (dns.promises.Resolver) wrapPromiseLookup(dns.promises.Resolver.prototype, fn);
    }
  }

  // ---- UDP ----
  const send = dgram.Socket.prototype.send;
  dgram.Socket.prototype.send = function orbEgressSend(...args) {
    const address = args.find((a, i) => i > 0 && typeof a === 'string');
    if (address)
      record({ kind: 'udp', host: address, loopback: isLoopback(address), allowed: allowed(address) });
    return send.apply(this, args);
  };
}
