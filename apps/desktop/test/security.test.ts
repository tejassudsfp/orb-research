import { describe, expect, it } from 'vitest';
import { DESIGN_FRAME_CSP, DESIGN_FRAME_PATH } from '@orb/shared';
import {
  canonicalPath,
  contentSecurityPolicy,
  decideNavigation,
  decideRequest,
  isBlockedApiPath,
  isDesignFrameUrl,
  redactUrl,
  scriptHash,
  sidecarOrigin,
  withCsp,
} from '../src/main/security.js';

const origin = 'http://127.0.0.1:43123';

describe('canonicalPath / isBlockedApiPath', () => {
  it('normalises encodings, slashes, dot segments and case', () => {
    expect(canonicalPath('/api//file')).toBe('/api/file');
    expect(canonicalPath('/api/%66ile')).toBe('/api/file');
    expect(canonicalPath('/api/%2566ile')).toBe('/api/file');
    expect(canonicalPath('/x/../api/./file')).toBe('/api/file');
    expect(canonicalPath('/API/File')).toBe('/api/file');
    expect(canonicalPath('\\api\\file')).toBe('/api/file');
    expect(canonicalPath('/%E0%A4%A')).toBe('/%e0%a4%a'); // malformed escape: left as is
  });
  it('blocks /api/file and anything under it, nothing else', () => {
    for (const p of [
      '/api/file',
      '/api/file/',
      '/api/files',
      '/api/%66ile',
      '/api//file',
      '/a/../api/file',
    ]) {
      expect(isBlockedApiPath(p), p).toBe(true);
    }
    for (const p of [
      '/',
      '/api/session/list',
      '/api/remote.mux',
      '/assets/file.js',
      '/api/orb/file-ish',
      '/apifile',
    ]) {
      expect(isBlockedApiPath(p), p).toBe(false);
    }
  });
});

describe('decideRequest', () => {
  it('allows the sidecar origin over http and ws', () => {
    expect(decideRequest(`${origin}/`, origin)).toBe('allow');
    expect(decideRequest(`${origin}/?token=abc`, origin)).toBe('allow');
    expect(decideRequest(`${origin}/assets/index-abc.js`, origin)).toBe('allow');
    expect(decideRequest(`${origin}/api/session/list`, origin)).toBe('allow');
    expect(decideRequest('ws://127.0.0.1:43123/api/remote.mux', origin)).toBe('allow');
  });
  it('cancels /api/file on the sidecar in every spelling', () => {
    expect(decideRequest(`${origin}/api/file?path=/etc/hosts`, origin)).toBe('cancel');
    expect(decideRequest(`${origin}/api/%66ile?path=/etc/hosts`, origin)).toBe('cancel');
    expect(decideRequest(`${origin}//api/file?path=/etc/hosts`, origin)).toBe('cancel');
    expect(decideRequest(`${origin}/API/FILE?path=/etc/hosts`, origin)).toBe('cancel');
  });
  it('cancels every other origin, port, host alias and scheme', () => {
    for (const url of [
      'https://example.com/',
      'http://127.0.0.1:9999/',
      'http://localhost:43123/',
      'http://[::1]:43123/',
      'https://127.0.0.1:43123/',
      'wss://127.0.0.1:43123/api/remote.mux',
      'file:///etc/hosts',
      'ftp://127.0.0.1:43123/',
      'not a url',
    ]) {
      expect(decideRequest(url, origin), url).toBe('cancel');
    }
  });
  it('allows in-memory schemes', () => {
    expect(decideRequest('data:image/png;base64,AAAA', origin)).toBe('allow');
    expect(decideRequest('blob:http://127.0.0.1:43123/uuid', origin)).toBe('allow');
    expect(decideRequest('devtools://devtools/bundled/inspector.html', origin)).toBe('allow');
  });
  it('cancels network requests while no sidecar is up', () => {
    expect(decideRequest(`${origin}/`, undefined)).toBe('cancel');
  });
});

describe('decideNavigation', () => {
  it('keeps same-origin navigation in the window', () => {
    expect(decideNavigation(`${origin}/?token=abc`, origin)).toBe('allow');
    expect(decideNavigation(`${origin}/canvas/1`, origin)).toBe('allow');
  });
  it('sends external links to the default browser', () => {
    expect(decideNavigation('https://example.com/a', origin)).toBe('external');
    expect(decideNavigation('http://example.com/', origin)).toBe('external');
    expect(decideNavigation('mailto:a@b.c', origin)).toBe('external');
    expect(decideNavigation('http://127.0.0.1:9999/', origin)).toBe('external');
  });
  it('denies /api/file and odd schemes', () => {
    expect(decideNavigation(`${origin}/api/file?path=/etc/hosts`, origin)).toBe('deny');
    expect(decideNavigation('file:///etc/hosts', origin)).toBe('deny');
    expect(decideNavigation('javascript:alert(1)', origin)).toBe('deny');
    expect(decideNavigation('orb-custom://x', origin)).toBe('deny');
  });
});

describe('CSP', () => {
  it('locks scripts to self + the gateway inline-script hashes and allows the same-origin socket', () => {
    const csp = contentSecurityPolicy(origin);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+;/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self' ws://127.0.0.1:43123");
    expect(csp).toContain("object-src 'none'");
    // P2.5: the pdf.js worker is bundled and served by the sidecar; no blob: or remote workers, no wasm.
    expect(csp).toContain("worker-src 'self';");
    expect(csp).not.toMatch(/wasm-unsafe-eval|unsafe-eval/);
    expect(csp).toContain(
      `'${scriptHash('(globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()).resolve()')}'`,
    );
  });
  it('replaces a sidecar CSP header and keeps other headers', () => {
    const out = withCsp(
      { 'content-security-policy': ['x'], 'Content-Type': ['text/html'] },
      `${origin}/`,
      origin,
    );
    expect(out['content-security-policy']).toBeUndefined();
    expect(out['Content-Type']).toEqual(['text/html']);
    expect(out['Content-Security-Policy']).toEqual([contentSecurityPolicy(origin)]);
  });
});

describe('P6.2 design frames', () => {
  const frame = `${origin}${DESIGN_FRAME_PATH}?canvas=abc&card=c_1&v=2`;

  it('the app may frame only the design-frame page of its own sidecar', () => {
    const csp = contentSecurityPolicy(origin);
    expect(csp).toContain(`frame-src ${origin}${DESIGN_FRAME_PATH};`);
    expect(csp).not.toMatch(/frame-src[^;]*('self'|\*|data:|blob:)/);
  });

  it('recognises the route in any spelling, on the sidecar only', () => {
    expect(isDesignFrameUrl(frame, origin)).toBe(true);
    expect(isDesignFrameUrl(`${origin}/api/orb-design/%66rame?x=1`, origin)).toBe(true);
    expect(isDesignFrameUrl(`${origin}/api/orb-design/frame/x`, origin)).toBe(false);
    expect(isDesignFrameUrl(`http://127.0.0.1:9${DESIGN_FRAME_PATH}`, origin)).toBe(false);
    expect(isDesignFrameUrl(frame, undefined)).toBe(false);
  });

  it("forces the frame's own CSP on its responses (never the app's)", () => {
    const out = withCsp({ 'content-security-policy': ['x'], 'Content-Type': ['text/html'] }, frame, origin);
    expect(out['content-security-policy']).toBeUndefined();
    expect(out['Content-Type']).toEqual(['text/html']);
    expect(out['Content-Security-Policy']).toEqual([DESIGN_FRAME_CSP]);
    // Even when the server sent none.
    expect(withCsp({}, frame, origin)['Content-Security-Policy']).toEqual([DESIGN_FRAME_CSP]);
    expect(DESIGN_FRAME_CSP).toContain("connect-src 'none'");
  });

  it('cancels every request a design frame makes, except loading its own page', () => {
    const from = { frameUrl: frame };
    expect(decideRequest(`${origin}/api/orb/canvas.list`, origin, { ...from, resourceType: 'xhr' })).toBe('cancel');
    expect(decideRequest(`${origin}/assets/x.js`, origin, { ...from, resourceType: 'script' })).toBe('cancel');
    expect(decideRequest('http://example.com/x.png', origin, { ...from, resourceType: 'image' })).toBe('cancel');
    expect(decideRequest(`${origin}/`, origin, { ...from, resourceType: 'subFrame' })).toBe('cancel');
    expect(decideRequest(frame, origin, { ...from, resourceType: 'subFrame' })).toBe('allow');
    expect(decideRequest('data:image/png;base64,AA', origin, { ...from, resourceType: 'image' })).toBe('allow');
    // The app page itself still reaches the sidecar, and loads the frame.
    expect(decideRequest(`${origin}/api/orb/canvas.list`, origin, { frameUrl: `${origin}/` })).toBe('allow');
    expect(decideRequest(frame, origin, { frameUrl: `${origin}/`, resourceType: 'subFrame' })).toBe('allow');
  });
});

describe('helpers', () => {
  it('derives the sidecar origin from a loopback token URL only', () => {
    expect(sidecarOrigin('http://127.0.0.1:43123/?token=abc')).toBe(origin);
    expect(() => sidecarOrigin('http://example.com/?token=abc')).toThrow();
    expect(() => sidecarOrigin('https://127.0.0.1:1/')).toThrow();
  });
  it('redacts query strings in logged URLs', () => {
    expect(redactUrl(`${origin}/?token=secret`)).toBe(`${origin}/?<redacted>`);
    expect(redactUrl('https://example.com/a')).toBe('https://example.com/a');
  });
});

describe('P5.1 boot page (orb-boot://app)', () => {
  it('lets the boot page load its own files, with or without a sidecar, and nothing on another orb-boot host', () => {
    expect(decideRequest('orb-boot://app/index.html?boot=1&theme=night', undefined)).toBe('allow');
    expect(decideRequest('orb-boot://app/assets/index.js', origin)).toBe('allow');
    expect(decideRequest('orb-boot://evil/assets/index.js', origin)).toBe('cancel');
    expect(decideRequest('file:///etc/hosts', origin)).toBe('cancel');
  });
  it('never lets a page navigate to the boot page', () => {
    expect(decideNavigation('orb-boot://app/index.html', origin)).toBe('deny');
  });
  it('keeps the boot CSP (no connections) on boot responses even when the sidecar is up', () => {
    const out = withCsp(
      { 'content-security-policy': ['x'], 'content-type': ['text/html'] },
      'orb-boot://app/index.html',
      origin,
    );
    expect(out['content-type']).toEqual(['text/html']);
    expect(String(out['Content-Security-Policy'])).toContain("connect-src 'none'");
    expect(Object.keys(out).filter((k) => k.toLowerCase() === 'content-security-policy')).toHaveLength(1);
  });
});
