/**
 * P6.2 (startup Keychain wait): a hint while the sidecar's read of the macOS Keychain is held, most likely by a macOS
 * access prompt ("orb wants to use your confidential information stored in 'ai.orb.app'"). On the warming-up Home
 * (no wire) main says so (`orbNative.boot.keychain()`, from orb-keychain's stderr notice); on the live Home the
 * sidecar does (`orb/keys.keychain`). Both are polled only while the read is not done.
 */
import { useEffect, useState } from 'react';
import { orbNative } from '../print/native.js';
import type { Wire } from '../wire/index.js';

const BOOT_POLL_MS = 400;
const LIVE_POLL_MS = 1000;

/** True while the Keychain read is waiting. */
export function useKeychainWaiting(wire: Wire | undefined): boolean {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ac = new AbortController();
    const poll = async () => {
      let again = true;
      try {
        if (wire) {
          const status = await wire.orb.keys.keychain(ac.signal);
          if (!live) return;
          setWaiting(status.state === 'waiting');
          again = status.state === 'loading' || status.state === 'waiting';
        } else {
          const ask = orbNative()?.boot?.keychain;
          if (!ask) return;
          const held = await ask();
          if (!live) return;
          setWaiting(held === true);
        }
      } catch {
        // An older sidecar, or the boot page going away: no hint.
        again = !wire;
      }
      if (live && again) timer = setTimeout(() => void poll(), wire ? LIVE_POLL_MS : BOOT_POLL_MS);
    };
    void poll();
    return () => {
      live = false;
      ac.abort();
      clearTimeout(timer);
    };
  }, [wire]);
  return waiting;
}

/** The hint itself (nothing while the Keychain is not waiting). */
export function KeychainHint({ wire, className }: { wire: Wire | undefined; className?: string }) {
  const waiting = useKeychainWaiting(wire);
  if (!waiting) return null;
  return (
    <p className={className} data-testid={wire ? 'keychain-hint' : 'warming-keychain-hint'} role="status">
      macOS is asking whether orb may use the Keychain, where your keys are kept. Choose Always Allow; agents start
      once it is answered.
    </p>
  );
}
