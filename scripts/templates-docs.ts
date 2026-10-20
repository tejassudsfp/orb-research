/**
 * P6.11: write docs/templates/<id>.md for every v2 template (`pnpm templates:docs`). The files are generated from the
 * template code (`templateMarkdown`), so they cannot drift; `packages/shared/test/templates.test.ts` fails when one is
 * stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATE_SPECS, templateMarkdown } from '@orb/shared';

const dir = join(import.meta.dirname, '..', 'docs', 'templates');
mkdirSync(dir, { recursive: true });
for (const spec of TEMPLATE_SPECS) {
  writeFileSync(join(dir, `${spec.id}.md`), templateMarkdown(spec));
  console.log(`docs/templates/${spec.id}.md`);
}
