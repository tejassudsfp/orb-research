/**
 * Orb's replacement for dsh-web-app's `web-runtime` row (which hard-codes the dsh frontend dist,
 * dsh-web-app/lib/index.js:110). It serves Orb's UI from the gateway origin and prints the
 * `dsh web:` token URL on stdout for Electron main to read. It adds no system-prompt section.
 *
 * It also exports the sidecar's log to stderr (which Electron main appends, redacted, to sidecar.log): every
 * harness warning and error, plus Orb's own `orb-*` info lines. dsh boots with only an in-memory log buffer
 * (cordis `LoggerService`, dsh-app-boot/lib/index.js:4053-4067), so without this the sidecar log stays silent
 * about failures such as a session that cannot be resumed.
 */
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static';
import { parentPidFromEnv, shutdownSelf, watchParent } from './parentWatch.js';

export const name = 'orb-web-shell';
export const inject = ['webServer'];

export type WebShellConfig = {
  /** Absolute path of Orb's built `index.html` (from ORB_UI_DIST). */
  distIndex: string;
};

/** Cordis levels: error 0, info 1, warn 2, debug 3 (`Logger._method`). */
type LogMessage = { type: string; name: string; args: unknown[] };

/** One stderr line per message: `<level> [<logger>] <text>`, multi-line messages indented. */
export function formatLogLine(message: LogMessage, text: string): string {
  return `${message.type} [${message.name}] ${text.replace(/\n/g, '\n    ')}\n`;
}

export function shouldExport(message: Pick<LogMessage, 'type' | 'name'>): boolean {
  if (message.type === 'error' || message.type === 'warn') return true;
  return message.type === 'info' && message.name.startsWith('orb-');
}

export function apply(ctx: any, config: WebShellConfig) {
  if (!config?.distIndex) throw new Error('orb-web-shell: distIndex is required (set ORB_UI_DIST)');
  const Logger = Object.getPrototypeOf(ctx.logger()).constructor as {
    format?: (exporter: unknown, message: LogMessage) => string;
  };
  ctx.logger.exporter({
    colors: 0,
    levels: { default: 2 },
    export: (message: LogMessage) => {
      if (!shouldExport(message)) return;
      let text: string;
      try {
        text = Logger.format ? Logger.format({ colors: 0 }, message) : message.args.map(String).join(' ');
      } catch {
        text = message.args.map(String).join(' ');
      }
      process.stderr.write(formatLogLine(message, text));
    },
  });
  // Exit when Electron main is gone (kill -9 / crash), so no orphan keeps the session locks.
  const parentPid = parentPidFromEnv();
  if (parentPid !== undefined) {
    ctx.effect(
      () =>
        watchParent({
          parentPid,
          onGone: () => {
            // Nobody reads our stdout/stderr pipes any more: swallow EPIPE so shutdown stays graceful.
            process.stdout.on('error', () => {});
            process.stderr.on('error', () => {});
            ctx.logger('orb-web-shell').warn(`parent ${parentPid} is gone; shutting the sidecar down`);
            shutdownSelf();
          },
        }),
      'orb-web-shell: parent watch',
    );
  }
  // `connection` injects webRuntime.trustedHosts; Orb never trusts LAN hosts.
  ctx.provide('webRuntime', { lanAddresses: [], trustedHosts: [] });
  ctx.plugin(FrontendStatic, { distIndex: config.distIndex });
  ctx.inject(['connection'], (c: any) => {
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      const url = c.connection.authenticatedUrl(`http://127.0.0.1:${String(c.webServer.port)}`);
      // The token URL goes to stdout only; Electron main parses it and never logs it.
      process.stdout.write(`dsh web: ${url}\n`);
    };
    const settled = c.get('loader')?.await();
    if (settled === undefined) announce();
    else settled.then(announce, () => {});
  });
}
