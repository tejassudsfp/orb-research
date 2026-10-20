/// <reference lib="dom" />
import { _electron as electron, expect, test } from '@playwright/test';
import { CanvasStore } from '@orb/canvas';
import { reportPlanFromFrames } from '@orb/shared';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MockLlm, MOCK_KEY_ENV, mockProviderPatch } from '../../../scripts/testkit/mockLlm.ts';
import { REPORT_SAMPLE } from '../../../scripts/testkit/reportFixture.ts';
import { namespaceSegments } from '../../../scripts/testkit/namespace.ts';
import { pdfToText } from '@orb/sources';
import { readFileSync } from 'node:fs';
import { liveWindow } from './support/ui.ts';
import { axeScan, contrastScan, formatContrast, formatViolations } from './support/a11y.ts';

test('professional report composes end to end, persists its format, exports complete front matter and has navigable contents', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'orb-professional-report-'));
  const home = join(tmp, 'Orb');
  const pictures = resolve('.orb-dev/e2e-results', ...namespaceSegments());
  mkdirSync(pictures, { recursive: true });
  const store = new CanvasStore({ home, searchIndex: false });
  const meta = await store.create({ prompt: 'Illustrative research report - synthetic evidence' });
  const frame = (
    await store.command(meta.id, {
      type: 'frame.added',
      frame: { title: 'Commercial assessment', color: 'sky', x: 0, y: 0, w: 900, h: 700 },
    })
  ).data as { frame: { id: string } };
  const add = async (type: 'source' | 'table', data: Record<string, unknown>, detail?: string) =>
    (
      (
        await store.command(meta.id, {
          type: 'card.added',
          card: {
            type,
            data,
            frameId: frame.frame.id,
            x: 20,
            y: 60,
            w: 340,
            h: 230,
            ...(detail ? { detail } : {}),
          },
        })
      ).data as { card: { id: string } }
    ).card.id;
  const sourceId = await add(
    'source',
    {
      title: 'Illustrative assessment evidence',
      url: 'https://example.com/illustrative-evidence',
      summary:
        'Synthetic account evidence for document workflow validation; not findings about actual institutions.',
    },
    Object.values(REPORT_SAMPLE).flat().join('\n\n'),
  );
  const tableId = await add('table', {
    title: 'Illustrative account comparison',
    columns: ['Account', 'Segment', 'Primary qualification question'],
    rows: [
      ['Alpha Bank', 'EU/UK', 'Confirm workflow ownership and the control gap.'],
      ['Beta Bank', 'Singapore', 'Confirm a pilot owner and access to operating evidence.'],
      ['Gamma Bank', 'India', 'Confirm platform integration and access permissions.'],
    ],
    totalRows: 3,
  });
  // A document written directly by the agent has no separate compose-job instructions file.
  const brief = await store.create({ prompt: 'Saved direct-chat brief' });
  const briefEvidence = (
    await store.command(brief.id, {
      type: 'card.added',
      card: {
        type: 'note',
        data: { text: 'A saved evidence record.' },
        frameId: null,
        x: 0,
        y: 0,
        w: 300,
        h: 200,
      },
    })
  ).data as { card: { id: string } };
  await store.port.composeSection(
    brief.id,
    {
      format: 'custom',
      sectionId: 'summary',
      heading: 'Brief',
      paragraphs: [{ text: 'A short saved brief.', cardIds: [briefEvidence.card.id] }],
    },
    { kind: 'agent', agent: 'orb', model: 'mock', sessionId: 'fixture' },
  );
  await store.close();
  writeFileSync(
    join(home, 'orb.json'),
    JSON.stringify({ appearance: { themeId: 'paper', accent: '#7048E8', mode: 'light' } }),
  );
  const llm = await new MockLlm().start();
  writeFileSync(join(tmp, 'mock.patch.yml'), mockProviderPatch(llm.baseURL));
  const app = await electron.launch({
    args: [resolve(import.meta.dirname, '..')],
    env: {
      ...process.env,
      ORB_HOME: home,
      ORB_DSH_HOME: join(tmp, 'dsh'),
      ORB_USER_DATA: join(tmp, 'electron'),
      ORB_EXTRA_PATCH_FILE: join(tmp, 'mock.patch.yml'),
      [MOCK_KEY_ENV]: 'orb-mock-key',
    } as Record<string, string>,
  });
  try {
    const page = await liveWindow(app);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate((id) => {
      location.hash = `#/canvas/${id}`;
    }, meta.id);
    await expect(page.getByTestId('canvas-screen')).toHaveAttribute('data-follow', 'open');
    await page.getByTestId('publish-port').click();
    await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
    await expect(page.getByTestId('composer-document-format')).toHaveValue('report');
    await expect(page.getByTestId('composer-export')).toBeDisabled();
    const plan = reportPlanFromFrames([{ id: frame.frame.id, title: 'Commercial assessment' }]);
    llm.enqueue(
      {
        toolCalls: [1, 2, 3]
          .map((n) => ({
            id: `read_source_${n}`,
            name: 'read_card',
            arguments: { cardId: sourceId, page: n },
          }))
          .concat([{ id: 'read_table', name: 'read_card', arguments: { cardId: tableId, page: 1 } }]),
      },
      {
        toolCalls: plan.map((section, i) => ({
          id: `write_section_${i}`,
          name: 'compose_section',
          arguments: {
            sectionId: section.id,
            heading: section.heading,
            paragraphs: REPORT_SAMPLE[section.id as keyof typeof REPORT_SAMPLE].map((text) => ({
              text,
              cardIds: section.id === 'commercial-assessment' ? [sourceId, tableId] : [sourceId],
            })),
            ...(section.id === 'commercial-assessment'
              ? {
                  figures: [
                    {
                      cardId: tableId,
                      caption:
                        'Illustrative account comparison and the qualification questions that drive prioritisation.',
                    },
                  ],
                }
              : {}),
          },
        })),
      },
      { text: 'The professional research report is saved.' },
    );
    await page.getByTestId('composer-compose').click();
    await expect(page.getByTestId('composer-progress')).toHaveAttribute('data-phase', 'composed');
    await expect(page.getByTestId('composer-export')).toBeEnabled();
    await page.getByTestId('composer-export').click();
    const exported = page.getByTestId('composer-saved');
    await expect(exported).toBeVisible({ timeout: 60_000 });
    const path = (await exported.getAttribute('data-file'))!;
    copyFileSync(path, join(pictures, 'illustrative-research-report.pdf'));
    const text = (await pdfToText(new Uint8Array(readFileSync(path)), 'file:///report.pdf')).text.replace(
      /\s+/g,
      ' ',
    );
    for (const title of [
      'Contents',
      'Executive summary',
      'Scope and methodology',
      'Commercial assessment',
      'Conclusions and recommendations',
      'Risks, limitations and open questions',
      'Appendix A.',
      'References',
      'Page 1 of',
    ])
      expect(text).toContain(title);
    expect(text.toLowerCase()).toContain('research report');
    expect(text).toContain('A change in confirmed ownership');
    expect(text).toContain('Gamma Bank');
    await page.getByTestId('composer-reading-view').click();
    await expect(page.getByTestId('port-screen')).toHaveAttribute('data-state', 'composed');
    await expect(page.getByTestId('port-report-draft')).toHaveCount(0);
    await expect(page.getByTestId('port-contents').getByRole('button')).toHaveCount(5);
    const hash = await page.evaluate(() => location.hash);
    await page
      .getByTestId('port-contents')
      .getByRole('button', { name: 'Commercial assessment', exact: true })
      .click();
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    expect(formatViolations(await axeScan(page, { exclude: ['iframe'] }))).toBe('');
    expect(formatContrast(await contrastScan(page))).toBe('');
    await page.screenshot({ path: join(pictures, 'report-reading-view.png') });
    await page.reload();
    await expect(page.getByTestId('port-screen')).toHaveAttribute('data-state', 'composed');
    await page.evaluate((id) => {
      location.hash = `#/canvas/${id}`;
    }, meta.id);
    await page.getByTestId('publish-port').click();
    await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
    await expect(page.getByTestId('composer-document-format')).toHaveValue('report');
    await page.getByTestId('composer-close').click();
    await page.evaluate((id) => {
      location.hash = `#/canvas/${id}`;
    }, brief.id);
    await page.getByTestId('publish-port').click();
    await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
    await expect(page.getByTestId('composer-document-format')).toHaveValue('custom');
    await expect(page.getByTestId('composer-export')).toBeEnabled();
  } finally {
    await app.close();
    await llm.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
