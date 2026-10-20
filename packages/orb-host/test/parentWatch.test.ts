import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { parentAlive, parentPidFromEnv, watchParent } from '../src/parentWatch.js';

describe('parentWatch', () => {
  it('reads ORB_PARENT_PID only as a pid > 1', () => {
    expect(parentPidFromEnv({})).toBeUndefined();
    expect(parentPidFromEnv({ ORB_PARENT_PID: 'abc' })).toBeUndefined();
    expect(parentPidFromEnv({ ORB_PARENT_PID: '1' })).toBeUndefined();
    expect(parentPidFromEnv({ ORB_PARENT_PID: '-5' })).toBeUndefined();
    expect(parentPidFromEnv({ ORB_PARENT_PID: '4242' })).toBe(4242);
  });

  it('our real parent is alive; another pid is not our parent', () => {
    expect(parentAlive(process.ppid)).toBe(true);
    expect(parentAlive(process.pid)).toBe(false);
  });

  it('fires onGone once when the parent goes away, and not after stop', async () => {
    let alive = true;
    let fired = 0;
    const stop = watchParent({ parentPid: 123, intervalMs: 10, isAlive: () => alive, onGone: () => fired++ });
    await new Promise((r) => setTimeout(r, 40));
    expect(fired).toBe(0);
    alive = false;
    await new Promise((r) => setTimeout(r, 60));
    expect(fired).toBe(1);
    stop();

    let fired2 = 0;
    const stop2 = watchParent({
      parentPid: 123,
      intervalMs: 10,
      isAlive: () => false,
      onGone: () => fired2++,
    });
    stop2();
    await new Promise((r) => setTimeout(r, 40));
    expect(fired2).toBe(0);
  });

  it('a grandchild whose parent is SIGKILLed notices within the interval', async () => {
    // parent: spawns a child that watches it with the real parentAlive, then the test kills the parent.
    const watcher = `
      const { parentAlive } = await import(${JSON.stringify(new URL('../src/parentWatch.ts', import.meta.url).href)});
      const ppid = process.ppid;
      setInterval(() => { if (!parentAlive(ppid)) { console.log('gone'); process.exit(0); } }, 50);
      console.log('ready');
    `;
    const parent = spawn(
      process.execPath,
      [
        '-e',
        `const c = require('node:child_process').spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', ${JSON.stringify(watcher)}], { stdio: ['ignore', 'inherit', 'inherit'] }); console.log('child ' + c.pid); setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    parent.stdout!.on('data', (d) => (out += String(d)));
    await expect.poll(() => out.includes('ready'), { timeout: 10_000 }).toBe(true);
    const childPid = Number(/child (\d+)/.exec(out)![1]);
    parent.kill('SIGKILL');
    const isAlive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await expect.poll(() => isAlive(childPid), { timeout: 5_000 }).toBe(false);
  });
});
