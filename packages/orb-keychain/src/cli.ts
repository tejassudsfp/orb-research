/**
 * Keychain helper for dev scripts and tests: `<electron> lib/cli.js <op> <service> [account]` with
 * ELECTRON_RUN_AS_NODE=1.
 *
 * It must run under the same binary as the sidecar (the Electron executable as Node). A Keychain item's ACL trusts
 * the binary that created it: another binary (plain `node`) reading it gets a macOS access prompt and blocks
 * (HARNESS_NOTES §P4.1). Values move on stdin/stdout pipes only and are never printed by this tool except for `get`,
 * whose stdout the caller captures.
 *
 *   clear   <service>             remove every item (test services only)  → {"removed": n}
 *   has     <service> <account>   is there an item                         → {"present": bool}
 *   matches <service> <account>   stdin = expected value                   → {"matches": bool}
 *   set     <service> <account>   stdin = value (test services only)       → {"ok": true}
 *   get     <service> <account>   the raw value on stdout (dev key helper), exit 3 when absent
 */
import { isTestService } from './index.js';
import { clearService, KeychainStore } from './store.js';

async function stdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const out = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

async function main(): Promise<number> {
  const [op, service, account] = process.argv.slice(2);
  if (!op || !service) {
    process.stderr.write('usage: cli <clear|has|matches|set|get> <service> [account]\n');
    return 2;
  }
  const store = new KeychainStore(service);
  const needAccount = (): string => {
    if (!account) throw new Error(`${op}: an account is required`);
    return account;
  };
  switch (op) {
    case 'clear':
      if (!isTestService(service)) throw new Error(`clear: refusing to clear non-test service ${service}`);
      out({ removed: await clearService(store) });
      return 0;
    case 'has':
      out({ present: (await store.get(needAccount())) !== undefined });
      return 0;
    case 'matches': {
      const expected = await stdin();
      out({ matches: (await store.get(needAccount())) === expected });
      return 0;
    }
    case 'set': {
      if (!isTestService(service)) throw new Error(`set: refusing to write non-test service ${service}`);
      const value = await stdin();
      if (!value) throw new Error('set: empty value');
      await store.set(needAccount(), value);
      out({ ok: true });
      return 0;
    }
    case 'get': {
      const value = await store.get(needAccount());
      if (value === undefined) return 3;
      process.stdout.write(value);
      return 0;
    }
    default:
      process.stderr.write(`unknown op ${op}\n`);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // The message never holds a value: only ops, services and accounts.
    process.stderr.write(`orb-keychain cli: ${(err as Error).message}\n`);
    process.exit(1);
  },
);
