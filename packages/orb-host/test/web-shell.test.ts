/** The sidecar log exporter in orb-web-shell: what reaches stderr (→ sidecar.log) and how it is formatted. */
import { describe, expect, it } from 'vitest';
import { formatLogLine, shouldExport } from '../src/web-shell.js';

describe('orb-web-shell log export', () => {
  it('exports every warning and error, and info only from orb-* loggers', () => {
    expect(shouldExport({ type: 'error', name: 'agent-loop' })).toBe(true);
    expect(shouldExport({ type: 'warn', name: 'session-persistence-jsonl' })).toBe(true);
    expect(shouldExport({ type: 'info', name: 'orb-agents' })).toBe(true);
    expect(shouldExport({ type: 'info', name: 'gateway' })).toBe(false);
    expect(shouldExport({ type: 'debug', name: 'orb-agents' })).toBe(false);
  });

  it('writes one prefixed line per message, indenting continuation lines', () => {
    expect(formatLogLine({ type: 'info', name: 'orb-agents', args: [] }, 'resumed root session s1')).toBe(
      'info [orb-agents] resumed root session s1\n',
    );
    expect(formatLogLine({ type: 'error', name: 'x', args: [] }, 'Error: boom\nat y')).toBe(
      'error [x] Error: boom\n    at y\n',
    );
  });
});
