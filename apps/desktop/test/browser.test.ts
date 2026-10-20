import { describe, expect, it } from 'vitest';
import { searchSource, searchTarget } from '../src/main/browserCore.ts';

describe('browser search destinations', () => {
  it('encodes queries as data and unwraps real source links', () => {
    const query = 'India jobs "Chennai" & <script>test</script>';
    const target = new URL(searchTarget(query, 'Bing'));
    expect(target.origin).toBe('https://www.bing.com');
    expect(target.searchParams.get('q')).toBe(query);
    const source = 'https://www.worldbank.org/en/country/india#jobs';
    expect(searchSource(`https://www.bing.com/ck/a?u=a1${Buffer.from(source).toString('base64url')}`)).toBe(
      'https://www.worldbank.org/en/country/india',
    );
    expect(searchSource(`https://duckduckgo.com/l/?uddg=${encodeURIComponent(source)}`)).toBe(
      'https://www.worldbank.org/en/country/india',
    );
  });
  it('refuses internal navigation, credentials, executable schemes and private source URLs', () => {
    for (const url of [
      'https://www.bing.com/settings',
      'https://duckduckgo.com/about',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'http://127.0.0.1/',
      'http://192.168.1.1/',
      'https://user:password@example.com/',
    ])
      expect(searchSource(url), url).toBeUndefined();
    expect(searchSource('https://example.com/report')).toBe('https://example.com/report');
  });
});
