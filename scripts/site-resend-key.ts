/** Save a website sending key locally without putting it in shell arguments, files or command history. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { KeychainStore } from '@orb/keychain';
if (process.platform !== 'darwin' || !process.stdin.isTTY)
  throw new Error('Run this interactively on macOS. Hosted servers use a server-only RESEND_API_KEY secret.');
const silent = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const input = createInterface({ input: process.stdin, output: silent, terminal: true });
try {
  process.stdout.write('Resend sending key (hidden): ');
  const key = (await input.question('')).trim();
  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error('Enter a valid Resend sending key.');
  await new KeychainStore('ai.orb.site').set('RESEND_API_KEY', key);
  process.stdout.write('\nWebsite sending key saved in macOS Keychain.\n');
} finally {
  input.close();
}
