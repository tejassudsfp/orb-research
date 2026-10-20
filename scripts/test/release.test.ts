import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORB_HOST_VERSION } from '../../packages/orb-host/src/remote.ts';

const root = join(import.meta.dirname, '..', '..');

describe('P6.9 release metadata', () => {
  it('orb-host reports its package version, never 0.0.0', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'packages/orb-host/package.json'), 'utf8'));
    expect(ORB_HOST_VERSION).toBe(pkg.version);
    expect(ORB_HOST_VERSION).not.toBe('0.0.0');
  });

  it('the dmg requires macOS 14 (PRD platform row)', () => {
    const yml = readFileSync(join(root, 'apps/desktop/electron-builder.yml'), 'utf8');
    expect(yml).toMatch(/minimumSystemVersion: '14\.0'/);
  });
});
