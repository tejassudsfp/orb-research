/**
 * Hash router (no dependency). The page path must stay `/` (the sidecar serves the UI there and the gateway's token
 * swap redirects to it), so screens live in the hash:
 *
 *   #/                 Home
 *   #/canvas/<id>      Canvas (`?focus=<card or frame id>` flies to that item once the board is loaded: Home search)
 *   #/port/<id>        Port (reading view; the composer sheet opens from the canvas)
 *   #/deck/<id>        Deck (slide view: reorder, edit, regenerate, export)
 *   #/settings         Settings
 *   #/first-run        First-run sheet
 *   #/dev              Engine diagnostics (session probe; not linked from the product UI)
 *
 * `parseRoute` / `routeHref` are pure (unit tested in apps/ui/test/router.unit.test.ts).
 */
export type Route =
  | { name: 'home' }
  | { name: 'canvas'; id: string; focus?: string }
  | { name: 'port'; id: string }
  | { name: 'deck'; id: string }
  | { name: 'settings' }
  | { name: 'first-run' }
  | { name: 'dev' }
  | { name: 'not-found'; path: string };

const decode = (s: string): string | undefined => {
  try {
    const out = decodeURIComponent(s);
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
};

/** Route of a `location.hash` value (`#/canvas/abc`, `#canvas/abc`, `` all work). */
export function parseRoute(hash: string): Route {
  const [rawPath = '', query = ''] = hash.replace(/^#/, '').split('?', 2);
  const path = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = path === '' ? [] : path.split('/');
  const [head, arg, ...rest] = parts;
  if (head === undefined) return { name: 'home' };
  if (rest.length === 0) {
    if ((head === 'canvas' || head === 'port' || head === 'deck') && arg !== undefined) {
      const id = decode(arg);
      if (id && head === 'canvas') {
        const focus = new URLSearchParams(query).get('focus');
        return focus ? { name: head, id, focus } : { name: head, id };
      }
      if (id) return { name: head, id };
    }
    if (arg === undefined) {
      if (head === 'settings') return { name: 'settings' };
      if (head === 'first-run') return { name: 'first-run' };
      if (head === 'dev') return { name: 'dev' };
    }
  }
  return { name: 'not-found', path: `/${path}` };
}

/** The `#/…` href of a route. */
export function routeHref(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'canvas':
      return `#/canvas/${encodeURIComponent(route.id)}${
        route.focus ? `?focus=${encodeURIComponent(route.focus)}` : ''
      }`;
    case 'port':
    case 'deck':
      return `#/${route.name}/${encodeURIComponent(route.id)}`;
    case 'settings':
    case 'first-run':
    case 'dev':
      return `#/${route.name}`;
    case 'not-found':
      return `#${route.path}`;
  }
}
