/**
 * The source cache of a canvas (PRD Sources; BUILD_PLAN P3.5): `<canvas>/assets/sources/<id>.md` holds the full
 * extracted text of a fetched page or PDF (or a dropped file), `<id>.json` its metadata. Agents read it in chunks
 * of at most 8k characters through `read_source` / `fetch_url {page}`; it is never exported in full and never
 * served to the UI (the asset route serves only files directly inside `assets/`).
 *
 * `<id>` is the first 32 hex digits of SHA-256 over the key: the URL without its fragment for a fetched source,
 * `asset:<path>` for a canvas file. Files are written to a temp name, fsynced, then renamed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/** Largest chunk `read_source` returns (BUILD_PLAN P3.5: at most 8k characters). */
export const CHUNK_CHARS = 8_000;
export const SOURCES_DIR = 'sources';

export const SourceMeta = z.strictObject({
  v: z.literal(1),
  id: z.string().regex(/^[0-9a-f]{32}$/),
  /** What was asked for: the URL, or `asset:<path>` for a canvas file. */
  key: z.string().max(4200),
  /** Fetched sources: the URL asked for, the URL that answered, and every URL requested on the way. */
  url: z.string().max(4096).optional(),
  finalUrl: z.string().max(4096).optional(),
  chain: z.array(z.string().max(4096)).max(16).optional(),
  /** Canvas files: the asset path. */
  asset: z.string().max(512).optional(),
  kind: z.enum(['html', 'text', 'pdf']),
  /** The stored article was extracted from a rendered browser DOM. */
  rendered: z.boolean().optional(),
  contentType: z.string().max(200).optional(),
  title: z.string().max(500),
  byline: z.string().max(300).optional(),
  siteName: z.string().max(300).optional(),
  publishedTime: z.string().max(64).optional(),
  excerpt: z.string().max(500).optional(),
  pdfPages: z.number().int().nonnegative().optional(),
  bytes: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative(),
  pages: z.number().int().positive(),
  truncated: z.boolean(),
  fetchedAt: z.number().int(),
  /** Who fetched it: agent role and session (never a secret). */
  by: z.string().max(200).optional(),
});
export type SourceMeta = z.infer<typeof SourceMeta>;

/** The cache key of a URL: the URL as parsed, without its fragment. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

export const sourceIdOf = (key: string): string =>
  createHash('sha256').update(key).digest('hex').slice(0, 32);

/**
 * Split text into chunks of at most `size` characters, preferring a paragraph break, then a line break, then a
 * space in the second half of a chunk, so words and paragraphs are rarely cut. Deterministic: the same text always
 * gives the same chunks, so a page number stays valid.
 */
export function chunkText(text: string, size = CHUNK_CHARS): string[] {
  if (text.length === 0) return [''];
  const out: string[] = [];
  let at = 0;
  while (at < text.length) {
    if (text.length - at <= size) {
      out.push(text.slice(at));
      break;
    }
    const window = text.slice(at, at + size);
    const min = Math.floor(size / 2);
    let cut = window.lastIndexOf('\n\n');
    if (cut < min) cut = window.lastIndexOf('\n');
    if (cut < min) cut = window.lastIndexOf(' ');
    if (cut < min) cut = size;
    else cut += 1;
    out.push(text.slice(at, at + cut));
    at += cut;
  }
  return out;
}

export type SourcePage = { meta: SourceMeta; page: number; pages: number; text: string };

export class SourceCache {
  constructor(readonly dir: string) {}

  static forCanvas(canvasDir: string): SourceCache {
    return new SourceCache(join(canvasDir, 'assets', SOURCES_DIR));
  }

  async readMeta(id: string): Promise<SourceMeta | undefined> {
    if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
    try {
      return SourceMeta.parse(JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')));
    } catch {
      return undefined;
    }
  }

  async readText(id: string): Promise<string | undefined> {
    if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
    try {
      return await readFile(join(this.dir, `${id}.md`), 'utf8');
    } catch {
      return undefined;
    }
  }

  /** Cached entry for a URL: by its own key, else any entry whose final URL or redirect chain is that URL. */
  async findUrl(url: string): Promise<SourceMeta | undefined> {
    const key = urlKey(url);
    const direct = await this.readMeta(sourceIdOf(key));
    if (direct && (await this.readText(direct.id)) !== undefined) return direct;
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return undefined;
    }
    for (const name of names.filter((n) => /^[0-9a-f]{32}\.json$/.test(n)).sort()) {
      const meta = await this.readMeta(name.slice(0, 32));
      if (!meta) continue;
      if ((meta.finalUrl && urlKey(meta.finalUrl) === key) || meta.chain?.some((u) => urlKey(u) === key))
        return meta;
    }
    return undefined;
  }

  /** Every cached entry (the egress audit reads the redirect chains). */
  async list(): Promise<SourceMeta[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const metas = await Promise.all(
      names.filter((n) => /^[0-9a-f]{32}\.json$/.test(n)).map((n) => this.readMeta(n.slice(0, 32))),
    );
    return metas.filter((m): m is SourceMeta => m !== undefined);
  }

  /** Store a source's text and metadata (text first, so a metadata file always has its text). */
  async write(entry: Omit<SourceMeta, 'v' | 'id' | 'chars' | 'pages'>, text: string): Promise<SourceMeta> {
    const id = sourceIdOf(entry.key);
    const meta = SourceMeta.parse({
      ...entry,
      v: 1,
      id,
      chars: text.length,
      pages: chunkText(text).length,
    });
    await mkdir(this.dir, { recursive: true });
    await writeAtomic(join(this.dir, `${id}.md`), text);
    await writeAtomic(join(this.dir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`);
    return meta;
  }

  /** One chunk (1-based) of a cached source. Throws RangeError for a page out of range. */
  async page(id: string, page = 1): Promise<SourcePage | undefined> {
    const meta = await this.readMeta(id);
    const text = meta ? await this.readText(id) : undefined;
    if (!meta || text === undefined) return undefined;
    const chunks = chunkText(text);
    if (!Number.isInteger(page) || page < 1 || page > chunks.length)
      throw new RangeError(
        `page ${page} does not exist; this source has ${chunks.length} page(s) of up to ${CHUNK_CHARS} characters`,
      );
    return { meta, page, pages: chunks.length, text: chunks[page - 1]! };
  }
}

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const fh = await open(tmp, 'wx', 0o644);
  try {
    await fh.writeFile(data, 'utf8');
    await fh.sync();
  } catch (err) {
    await fh.close().catch(() => {});
    await rm(tmp, { force: true });
    throw err;
  }
  await fh.close();
  await rename(tmp, path);
}
