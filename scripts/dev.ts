/**
 * `pnpm dev`: rebuild the UI on change with `vite build --watch` (the sidecar serves apps/ui/dist on its own
 * origin; a Vite dev server would be a second origin the gateway's Origin check rejects) and run Electron via
 * electron-vite. Stops the watcher when Electron exits. Reload the window (Cmd+R) to pick up UI rebuilds.
 */
import { spawn, type ChildProcess } from 'node:child_process';

const pnpm = (args: string[]): ChildProcess => {
  const execPath = process.env.npm_execpath;
  return execPath && /\.c?js$/.test(execPath)
    ? spawn(process.execPath, [execPath, ...args], { stdio: 'inherit' })
    : spawn('pnpm', args, { stdio: 'inherit' });
};

const watcher = pnpm(['--filter', '@orb/ui', 'watch']);
const electron = pnpm(['--filter', '@orb/desktop', 'dev']);

const stop = (code: number) => {
  if (!watcher.killed) watcher.kill('SIGTERM');
  process.exitCode = code;
};
electron.on('exit', (code) => stop(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    electron.kill(sig);
    stop(130);
  });
}
