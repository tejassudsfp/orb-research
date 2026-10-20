import type { PostHog } from 'posthog-js';

const consentKey = 'orb-site-analytics-v1';
type Consent = 'accepted' | 'declined';

let activeClient: PostHog | undefined;

/**
 * Capture one named site event, only after the visitor accepted analytics cookies. sendBeacon lets the event leave
 * even when the click starts a download or navigation.
 */
export function track(event: string, properties: Record<string, string> = {}) {
  activeClient?.capture(event, properties, { transport: 'sendBeacon' });
}

/** Website analytics only. Never imported by the desktop app or research UI. */
export function setupAnalytics() {
  const token = import.meta.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = import.meta.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) return;

  const banner = document.querySelector<HTMLElement>('#cookie-notice')!;
  const settings = document.querySelector<HTMLButtonElement>('#cookie-settings')!;
  const status = document.querySelector<HTMLElement>('#cookie-status')!;
  let consent: Consent | undefined;
  let client: PostHog | undefined;
  let loading: Promise<void> | undefined;
  try {
    const saved = localStorage.getItem(consentKey);
    if (saved === 'accepted' || saved === 'declined') consent = saved;
  } catch {
    // A blocked preference store must not prevent the site or cookie controls from working.
  }

  function render() {
    document.documentElement.dataset.analytics = consent ?? 'pending';
    status.textContent = consent === 'accepted' ? 'Analytics cookies are on.' : 'Analytics cookies are off.';
    banner.hidden = consent !== undefined;
  }

  async function start() {
    if (client || loading) return loading;
    loading = (async () => {
      try {
        // The bundled no-external entry cannot inject replay, survey or other remote scripts.
        const { default: posthog } = await import('posthog-js/no-external');
        if (consent !== 'accepted') return;
        client = posthog.init(token, {
          api_host: host,
          persistence: 'cookie',
          cross_subdomain_cookie: false,
          cookie_expiration: 180,
          person_profiles: 'never',
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_exceptions: false,
          capture_performance: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_web_experiments: true,
          disable_external_dependency_loading: true,
          advanced_disable_flags: true,
          save_referrer: false,
          save_campaign_params: false,
          property_denylist: [
            '$set',
            '$set_once',
            '$initial_current_url',
            '$initial_referrer',
            '$initial_referring_domain',
            '$session_entry_url',
            '$session_entry_referrer',
            '$session_entry_referring_domain',
          ],
          request_batching: false,
          opt_out_capturing_by_default: true,
          opt_out_persistence_by_default: true,
          before_send: (event) => {
            if (consent !== 'accepted') return null;
            // Do not send query strings, anchors or inbound referrer details.
            event.properties.$current_url = location.origin + location.pathname;
            event.properties.$referrer = '';
            return event;
          },
        });
        client?.opt_in_capturing({ captureEventName: false });
        activeClient = client;
        client?.capture('$pageview');
      } catch {
        // Analytics failure must never interrupt the product site.
        status.textContent = 'Analytics is unavailable. You can still use the site.';
      } finally {
        loading = undefined;
      }
    })();
    return loading;
  }

  function choose(next: Consent) {
    consent = next;
    try {
      localStorage.setItem(consentKey, next);
    } catch {
      // Respect the choice for this page even if it cannot be remembered.
    }
    if (next === 'declined') {
      client?.opt_out_capturing();
      client = undefined;
      activeClient = undefined;
    }
    render();
    settings.focus({ preventScroll: true });
    if (next === 'accepted') void start();
  }

  settings.hidden = false;
  settings.addEventListener('click', () => {
    banner.hidden = false;
    document.querySelector<HTMLButtonElement>('#cookie-decline')!.focus({ preventScroll: true });
  });
  document.querySelector('#cookie-accept')!.addEventListener('click', () => choose('accepted'));
  document.querySelector('#cookie-decline')!.addEventListener('click', () => choose('declined'));
  render();
  if (consent === 'accepted') void start();
}
