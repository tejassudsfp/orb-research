/**
 * @orb/port: the research document's citation rule, edits and storage (BUILD_PLAN P4.5, PRD Port › Research
 * document). Harness-free: the `compose_section` tool itself is registered by orb-canvas (CLAUDE.md: harness seams
 * live only in orb-host / orb-agents / orb-canvas), and only the canvas service calls the storage functions here
 * (it stays the single writer of canvas folders).
 *
 * - `validateSection`: citations are structural. Every paragraph needs a non-empty `cardIds`, every cited card and
 *   every figure must be a card of the compose scope. Anything else is refused with a short message the model can
 *   act on.
 * - `upsertSection` / `applyEdits`: a section replaces the one with its id (a regenerate keeps the user's own
 *   paragraphs); the reading view's edits change text only, so an edited paragraph keeps its citations, and a new
 *   paragraph is `userAuthored` (exempt from the citation rule).
 * - `renderMarkdown`: `port/doc.md`, with numbered citations `[1]`, figures and a numbered reference list.
 * - `readPort` / `writePortDoc` / `writeInstructions`: `port/citations.json` (the structured sidecar the app reads
 *   back), `port/doc.md` and `port/instructions.json`, written atomically inside a real `port/` folder.
 */
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open as openFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ComposeSectionArgs,
  PORT_CITATIONS_FILE,
  PORT_DIR,
  PORT_DOC_FILE,
  PORT_INSTRUCTIONS_FILE,
  PortDoc,
  PortInstructions,
  cardTitle,
  cardUrl,
  citationNumbers,
  type Card,
  type PortParagraph,
  type PortSaveArgs,
  type PortSection,
} from '@orb/shared';

export const name = '@orb/port';

export * from './deck.js';
export * from './deckPptx.js';

/** A refused section or edit; the message goes back to the model (or the UI) as is. */
export class PortError extends Error {
  override name = 'PortError';
  constructor(
    readonly code: 'invalid' | 'out-of-scope' | 'uncited' | 'conflict' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}

export const isPortError = (e: unknown): e is PortError => e instanceof Error && e.name === 'PortError';

export type ValidSection = {
  format?: 'report' | 'custom';
  sectionId: string;
  heading: string;
  paragraphs: { text: string; cardIds: string[] }[];
  figures: { cardId: string; caption: string }[];
};

const nth = (i: number) => `paragraph ${i + 1}`;

/**
 * Check one `compose_section` call against the cards in scope (`inScope(id)`; `exists(id)` tells an unknown id from
 * one outside the scope, for a clearer message). Duplicate ids in one paragraph are collapsed.
 */
export function validateSection(
  raw: unknown,
  inScope: (cardId: string) => boolean,
  exists: (cardId: string) => boolean = inScope,
): ValidSection {
  const parsed = ComposeSectionArgs.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    // An empty cardIds array is refused below with the citation message; other shape errors are reported here.
    throw new PortError(
      'invalid',
      `invalid ${path.map(String).join('.') || 'arguments'}: ${issue?.message ?? 'bad value'}`,
    );
  }
  const args = parsed.data;
  const check = (id: string, where: string) => {
    if (inScope(id)) return;
    if (exists(id))
      throw new PortError(
        'out-of-scope',
        `${where} cites card ${id}, which is outside the scope of this document: cite only the cards listed for it`,
      );
    throw new PortError(
      'out-of-scope',
      `${where} cites ${JSON.stringify(id)}, which is not a card on this board`,
    );
  };
  const paragraphs = args.paragraphs.map((p, i) => {
    const cardIds = [...new Set(p.cardIds.map((id) => id.trim()).filter(Boolean))];
    if (cardIds.length === 0)
      throw new PortError(
        'uncited',
        `${nth(i)} has no citations: every paragraph needs cardIds naming at least one card in scope that supports it`,
      );
    for (const id of cardIds) check(id, nth(i));
    // Card IDs belong to the structured citations. A model can copy its chat citation style into prose;
    // normalize only references already backed by cardIds, and refuse an untracked inline reference.
    const text = p.text
      .replace(/\[(c_[A-Za-z0-9_-]+)\]/g, (_mark, id: string) => {
        if (!cardIds.includes(id))
          throw new PortError(
            'uncited',
            `${nth(i)} includes an inline card reference ${id} missing from cardIds. Put supporting IDs in cardIds only; the app adds numbered citations.`,
          );
        return '';
      })
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([,.;:!?])/g, '$1')
      .trim();
    if (!text) throw new PortError('invalid', `${nth(i)} needs analytical text, not only citation marks`);
    return { text, cardIds };
  });
  const seen = new Set<string>();
  const figures: ValidSection['figures'] = [];
  for (const [i, f] of (args.figures ?? []).entries()) {
    const id = f.cardId.trim();
    check(id, `figure ${i + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    figures.push({ cardId: id, caption: f.caption });
  }
  return {
    sectionId: args.sectionId,
    heading: args.heading,
    paragraphs,
    figures,
    ...(args.format ? { format: args.format } : {}),
  };
}

export const paragraphId = (): string => `p_${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x')}`;

/** A new, empty document. */
export function emptyDoc(
  input: Pick<PortDoc, 'title' | 'scope' | 'instructions'> & Partial<Pick<PortDoc, 'format'>>,
  now: number,
): PortDoc {
  return { v: 1, version: 0, ...input, sections: [], composedAt: now, updatedAt: now };
}

/**
 * Put a composed section into the document: it replaces the section with the same id in place (a regenerate keeps
 * the user's own paragraphs of that section, after the new ones), or is appended.
 */
export function upsertSection(
  doc: PortDoc,
  section: ValidSection,
  meta: { now: number; model?: string },
): { doc: PortDoc; position: number } {
  const previous = doc.sections.find((s) => s.id === section.sectionId);
  const kept = previous?.paragraphs.filter((p) => p.userAuthored) ?? [];
  const next: PortSection = {
    id: section.sectionId,
    heading: section.heading,
    paragraphs: [
      ...section.paragraphs.map((p): PortParagraph => ({
        id: paragraphId(),
        text: p.text,
        cardIds: p.cardIds,
      })),
      ...kept,
    ],
    figures: section.figures,
    composedAt: meta.now,
    ...(meta.model ? { model: meta.model } : {}),
  };
  const sections = previous
    ? doc.sections.map((s) => (s.id === section.sectionId ? next : s))
    : [...doc.sections, next];
  return {
    doc: { ...doc, sections, version: doc.version + 1, updatedAt: meta.now },
    position: sections.findIndex((s) => s.id === section.sectionId) + 1,
  };
}

/**
 * Apply the reading view's edits (`port.saveDoc`). Only text changes: headings, paragraph text, paragraphs the
 * user adds (`userAuthored`, no citations) or removes. A paragraph of Orb's keeps its citations whatever the client
 * sends; sections and figures stay as composed. The edits must start from the current `version`.
 */
export function applyEdits(doc: PortDoc, edits: PortSaveArgs, now: number): PortDoc {
  if (edits.version !== doc.version)
    throw new PortError(
      'conflict',
      `the document changed (version ${doc.version}, edits made on ${edits.version}); reload it and edit again`,
    );
  const ids = doc.sections.map((s) => s.id);
  const editIds = edits.sections.map((s) => s.id);
  if (ids.length !== editIds.length || ids.some((id, i) => id !== editIds[i]))
    throw new PortError('invalid', 'the edits must list the document sections in order');
  const sections = doc.sections.map((section, i) => {
    const edit = edits.sections[i]!;
    const byId = new Map(section.paragraphs.map((p) => [p.id, p]));
    const used = new Set<string>();
    const paragraphs = edit.paragraphs.map((p): PortParagraph => {
      if (p.id === undefined) return { id: paragraphId(), text: p.text, cardIds: [], userAuthored: true };
      const before = byId.get(p.id);
      if (!before || used.has(p.id))
        throw new PortError('not-found', `no paragraph ${p.id} in section ${section.id}`);
      used.add(p.id);
      if (before.text === p.text) return before;
      return before.userAuthored
        ? { ...before, text: p.text }
        : { ...before, text: p.text, edited: true as const };
    });
    const changed =
      edit.heading !== section.heading ||
      paragraphs.length !== section.paragraphs.length ||
      paragraphs.some((p, j) => p !== section.paragraphs[j]);
    return changed ? { ...section, heading: edit.heading, paragraphs } : section;
  });
  return { ...doc, sections, version: doc.version + 1, updatedAt: now };
}

/** `port/doc.md`: the document in Markdown, with numbered citations, figures and the reference list. */
export function renderMarkdown(
  doc: PortDoc,
  cardOf: (id: string) => Card | undefined,
  reportReview?: readonly string[],
): string {
  const numbers = citationNumbers(doc);
  const lines: string[] = [`# ${doc.title}`, ''];
  if (doc.format === 'report') {
    lines.push(
      'Research report',
      '',
      `Version: ${doc.version}`,
      `Prepared: ${new Date(doc.composedAt).toISOString().slice(0, 10)}`,
      `Last updated: ${new Date(doc.updatedAt).toISOString().slice(0, 10)}`,
      `Status: ${reportReview?.length === 0 ? 'Prepared document' : 'Draft - further development required'}`,
      '',
      '## Contents',
      '',
      ...doc.sections.map((s, i) => `${i + 1}. ${s.heading}`),
      '',
    );
    if (reportReview?.length)
      lines.push('### Draft review points', '', ...reportReview.map((problem) => `- ${problem}`), '');
  }
  let figureN = 0;
  let tableN = 0;
  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const p of section.paragraphs) {
      const refs = p.cardIds.map((id) => `[${numbers.get(id)}]`).join('');
      lines.push(`${p.text.trim()}${refs ? ` ${refs}` : ''}`, '');
    }
    for (const f of section.figures) {
      const card = cardOf(f.cardId);
      const label = card?.type === 'table' ? `Table ${++tableN}` : `Figure ${++figureN}`;
      const caption = f.caption || (card ? cardTitle(card) : f.cardId);
      lines.push(`> **${label}.** ${caption} (card ${f.cardId})`, '');
    }
  }
  if (numbers.size > 0) {
    lines.push('## References', '');
    for (const [id, n] of numbers) {
      const card = cardOf(id);
      const title = card ? cardTitle(card) : 'A card no longer on the board';
      const url = card ? cardUrl(card) : undefined;
      lines.push(`${n}. ${title}${url ? `. <${url}>` : ''} (card ${id})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---- Storage ----

/** `<canvasDir>/port`, created when needed; refused when it is not a real folder of the canvas (e.g. a symlink). */
async function portDir(canvasDir: string): Promise<string> {
  const dir = join(canvasDir, PORT_DIR);
  await mkdir(dir, { recursive: true });
  const st = await lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink())
    throw new PortError('invalid', `${PORT_DIR} is not a folder of this canvas`);
  return dir;
}

async function syncDir(dir: string): Promise<void> {
  const fh = await openFile(dir, 'r');
  try {
    await fh.sync();
  } catch {
    // some filesystems refuse fsync on a directory
  } finally {
    await fh.close();
  }
}

async function writeAtomic(dir: string, file: string, text: string): Promise<void> {
  const tmp = join(dir, `.${file}.${randomBytes(6).toString('hex')}.tmp`);
  const fh = await openFile(tmp, 'wx', 0o644);
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, join(dir, file));
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (err instanceof SyntaxError) return undefined;
    throw err;
  }
}

/** The stored document and instructions (null when absent or unreadable). */
export async function readPort(
  canvasDir: string,
): Promise<{ doc: PortDoc | null; instructions: PortInstructions | null }> {
  const dir = join(canvasDir, PORT_DIR);
  const [doc, instructions] = await Promise.all([
    readJson(join(dir, PORT_CITATIONS_FILE)),
    readJson(join(dir, PORT_INSTRUCTIONS_FILE)),
  ]);
  const d = PortDoc.safeParse(doc);
  const i = PortInstructions.safeParse(instructions);
  return { doc: d.success ? d.data : null, instructions: i.success ? i.data : null };
}

/** Write `citations.json` then `doc.md` (each atomic). */
export async function writePortDoc(canvasDir: string, doc: PortDoc, markdown: string): Promise<void> {
  const dir = await portDir(canvasDir);
  await writeAtomic(dir, PORT_CITATIONS_FILE, `${JSON.stringify(PortDoc.parse(doc), null, 2)}\n`);
  await writeAtomic(dir, PORT_DOC_FILE, markdown);
  await syncDir(dir);
}

export async function writeInstructions(canvasDir: string, value: PortInstructions): Promise<void> {
  const dir = await portDir(canvasDir);
  await writeAtomic(
    dir,
    PORT_INSTRUCTIONS_FILE,
    `${JSON.stringify(PortInstructions.parse(value), null, 2)}\n`,
  );
  await syncDir(dir);
}
