import { createRoot } from 'react-dom/client';
import { parsePrintRoute } from '@orb/shared';
import './theme/fonts.js';
import './theme/tokens.css';
import './theme/base.css';
import { App } from './App.js';
import { BootApp, bootParams, isBootPage } from './app/BootApp.js';
import { PrintApp } from './print/PrintApp.js';
import { browserEnv, createWire } from './wire/index.js';
import { applyAppearance } from './theme/appearance.js';

const root = createRoot(document.getElementById('root')!);

if (isBootPage(location)) {
  // P5.1: the warming-up Home, served by main before the sidecar is ready. No engine, no wire.
  const params = bootParams(location.search);
  applyAppearance(params.appearance, params.theme === 'night');
  document.documentElement.dataset.motion = params.motion;
  root.render(<BootApp {...params} />);
} else {
  start();
}

function start(): void {
  /** One gateway client for the page: same-origin fetch + the remote.mux socket (cookie from the token swap). */
  const wire = createWire(browserEnv());

  // P4.4: a print route (`#/print/canvas?…`, `#/print/doc?…`) renders the print page only, in the hidden print window.
  if (location.hash.startsWith('#/print/')) {
    const request = parsePrintRoute(location.hash);
    root.render(
      request ? (
        <PrintApp wire={wire} request={request} />
      ) : (
        <p data-testid="print-root" data-error="invalid print route">
          This print route is not valid.
        </p>
      ),
    );
  } else {
    wire.events.start();
    root.render(<App wire={wire} />);
  }
}
