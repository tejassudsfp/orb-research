/**
 * Reduce Motion (PRD Motion; P5.3 Settings › Appearance › Motion). Motion is reduced when macOS Reduce Motion is on
 * OR the user chose "Reduce" in Settings, which the App writes to `<html data-motion="reduce">` (CSS uses the same
 * attribute beside its `prefers-reduced-motion` queries).
 */
const QUERY = '(prefers-reduced-motion: reduce)';

const media = (): MediaQueryList | undefined =>
  typeof matchMedia === 'function' ? matchMedia(QUERY) : undefined;

/** True when motion should be reduced now. */
export function reduceMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce') return true;
  return media()?.matches ?? false;
}

/** Call `listener` whenever the answer of `reduceMotion()` may have changed. Returns the unsubscribe. */
export function onReduceMotionChange(listener: () => void): () => void {
  const mq = media();
  mq?.addEventListener('change', listener);
  const observer =
    typeof MutationObserver === 'function' && typeof document !== 'undefined'
      ? new MutationObserver(listener)
      : undefined;
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  return () => {
    mq?.removeEventListener('change', listener);
    observer?.disconnect();
  };
}
