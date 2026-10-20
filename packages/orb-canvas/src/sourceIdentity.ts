/** One page has one source card; meaningful query parameters stay part of its identity. */
export function sourceIdentity(raw: unknown): string {
  try {
    const url = new URL(String(raw));
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(?:gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return String(raw); }
}
