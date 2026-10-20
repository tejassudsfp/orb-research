/** `#/dev`: engine diagnostics (raw harness session probe). Not linked from the product UI. */
import { routeHref } from '../../app/router.js';
import { BackIcon } from '../../components/icons.js';
import type { Wire } from '../../wire/index.js';
import p from '../../components/Page.module.css';
import { SessionProbe } from './SessionProbe.js';

export function DevScreen({ wire }: { wire: Wire }) {
  return (
    <main className={p.page} data-testid="dev-screen">
      <div className={p.topBar}>
        <a href={routeHref({ name: 'home' })} className={p.back}>
          <BackIcon />
          Home
        </a>
      </div>
      <div className={p.column}>
        <h1 className={p.heading}>Engine diagnostics</h1>
        <SessionProbe wire={wire} />
      </div>
    </main>
  );
}
