/**
 * Redacted descriptors for the UI (PRD Models › Security: "The UI only ever receives a redacted descriptor, for
 * example 'sk-...4f2a'"). A key's vendor prefix (`sk-`, `sk-ant-`, `sk-or-`, `tvly-`, …; letters only, at most
 * 8 characters before the last dash of the prefix run) and its last four characters survive; nothing else does.
 * Short keys (under 16 characters, e.g. a local server's placeholder) keep no tail at all, so the descriptor never
 * gives away a meaningful share of the secret.
 */
/** One or two letter runs, each ending in a dash (`sk-`, `sk-ant-`, `tvly-`). */
const PREFIXES = [/^[A-Za-z]{2,5}-[A-Za-z]{2,5}-/, /^[A-Za-z]{2,5}-/];
const MAX_PREFIX = 8;
const MIN_LENGTH_FOR_TAIL = 16;

export function redactKey(value: string): string {
  const key = value.trim();
  if (key.length === 0) return '';
  // The longest vendor prefix of at most 8 characters, and never more than a third of the key.
  const prefix =
    PREFIXES.map((re) => re.exec(key)?.[0] ?? '').find(
      (p) => p.length > 0 && p.length <= MAX_PREFIX && p.length * 3 <= key.length,
    ) ?? '';
  if (key.length < MIN_LENGTH_FOR_TAIL) return `${prefix}...`;
  return `${prefix}...${key.slice(-4)}`;
}
