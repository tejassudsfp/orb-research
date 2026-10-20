import { useEffect, useState } from 'react';
import { parseRoute, routeHref, type Route } from './router.js';

/** The current route; re-renders on `hashchange`. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Go to a route (adds a history entry, so Back works). */
export function navigate(route: Route): void {
  const href = routeHref(route);
  if (location.hash !== href) location.hash = href;
}
