/** P4.1: redaction, account layout, service selection and the store contract of `@orb/keychain`. */
import { describe, expect, it } from 'vitest';
import {
  clearService,
  isTestService,
  KEYCHAIN_SERVICE,
  MemoryStore,
  parseAccount,
  recordAccount,
  redactKey,
  resolveKeychainService,
} from '../src/index.js';

describe('redactKey', () => {
  it('keeps the vendor prefix and the last four characters only', () => {
    expect(redactKey(`sk-${'x'.repeat(44)}4f2a`)).toBe('sk-...4f2a');
    expect(redactKey(`sk-proj-${'x'.repeat(40)}9b1c`)).toBe('sk-proj-...9b1c');
    expect(redactKey(`sk-ant-api03-${'x'.repeat(80)}AAAA`)).toBe('sk-ant-...AAAA');
    expect(redactKey(`sk-or-v1-${'0'.repeat(60)}beef`)).toBe('sk-or-...beef');
    expect(redactKey(`tvly-${'x'.repeat(30)}1234`)).toBe('tvly-...1234');
    expect(redactKey(`BSA${'x'.repeat(24)}wxyz`)).toBe('...wxyz');
  });

  it('gives nothing meaningful away for short values', () => {
    expect(redactKey('ollama')).toBe('...');
    expect(redactKey('sk-short123')).toBe('sk-...');
    expect(redactKey('')).toBe('');
  });

  it('never contains more than the prefix and four characters of the key', () => {
    for (let i = 0; i < 200; i++) {
      const key = `sk-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${i}`;
      const out = redactKey(key);
      const visible = out.replace('...', '');
      expect(visible.length).toBeLessThanOrEqual(8 + 4);
      expect(key.includes(out)).toBe(false);
    }
  });
});

describe('Keychain layout', () => {
  it('accounts: a reference is its own name, a record is record:<scope>/<id>', () => {
    expect(parseAccount('OPENAI_API_KEY')).toEqual({ kind: 'ref', ref: 'OPENAI_API_KEY' });
    expect(parseAccount(recordAccount('client-connection/browser-session'))).toEqual({
      kind: 'record',
      key: 'client-connection/browser-session',
    });
    expect(parseAccount('probe-1-2')).toEqual({ kind: 'other' });
  });

  it('the service is ai.orb.app unless ORB_KEYCHAIN_SERVICE names a test service', () => {
    expect(KEYCHAIN_SERVICE).toBe('ai.orb.app');
    expect(resolveKeychainService({})).toBe('ai.orb.app');
    expect(resolveKeychainService({ ORB_KEYCHAIN_SERVICE: 'ai.orb.app.test.x' })).toBe('ai.orb.app.test.x');
    expect(resolveKeychainService({ ORB_KEYCHAIN_SERVICE: 'com.apple.something' })).toBe('ai.orb.app');
    expect(resolveKeychainService({ ORB_KEYCHAIN_SERVICE: 'ai.orb.app.test.' })).toBe('ai.orb.app');
    expect(isTestService('ai.orb.app')).toBe(false);
  });

  it('clearService removes every item of a store', async () => {
    const store = new MemoryStore();
    await store.set('A_KEY', '1');
    await store.set('record:a/b', '{}');
    expect(await clearService(store)).toBe(2);
    expect(await store.list()).toEqual([]);
  });
});
