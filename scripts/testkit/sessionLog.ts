/**
 * Read a harness session log (the JSONL artifact written by `dsh-session-persistence-jsonl`) from a test.
 *
 * Artifacts live at `DSH_HOME/sessions/<encoded cwd>/<sessionId>/session.v<N>.jsonl[.zstd]`. The default encoding
 * is zstd with ONE independent frame per append batch; `zlib.zstdDecompressSync` stops after the first frame, so
 * the frames are split here exactly like the harness does (`scanZstdFrames`,
 * node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js:1300-1362) and decoded one by one. A torn
 * final frame (crash mid-append) is ignored, as the harness would truncate it on the next write-open.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;

/** Byte ranges of the complete zstd frames in `buffer`. */
export function zstdFrames(buffer: Buffer): Array<{ start: number; end: number }> {
  const frames: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 5) return frames;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`bad zstd frame magic at byte ${offset}`);
    offset += 4;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    for (;;) {
      if (buffer.length - offset < 3) return frames;
      const header = buffer.readUIntLE(offset, 3);
      offset += 3;
      const blockType = (header >>> 1) & 3;
      offset += blockType === 1 ? 1 : header >>> 3;
      if (offset > buffer.length) return frames;
      if ((header & 1) !== 0) break;
    }
    if (checksum) offset += 4;
    if (offset > buffer.length) return frames;
    frames.push({ start, end: offset });
  }
  return frames;
}

/** Decode one artifact into its JSONL text (plain `.jsonl` or multi-frame `.jsonl.zstd`). */
export function decodeSessionArtifact(path: string): string {
  const bytes = readFileSync(path);
  if (!path.endsWith('.zstd')) return bytes.toString('utf8');
  return zstdFrames(bytes)
    .map(({ start, end }) => zstdDecompressSync(bytes.subarray(start, end)).toString('utf8'))
    .map((chunk) => (chunk.endsWith('\n') ? chunk : `${chunk}\n`))
    .join('');
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

export type SessionLogEvent = { type: string; seq?: number; data?: any; [key: string]: unknown };

/** Every stored line (header first) of `sessionId`'s current artifact under `dshHome/sessions`. */
export function readSessionLog(dshHome: string, sessionId: string): SessionLogEvent[] {
  const artifacts = filesUnder(join(dshHome, 'sessions'))
    .filter((p) => p.split('/').includes(sessionId) && /session(\.v\d+)?\.jsonl(\.zstd)?$/.test(p))
    .sort();
  if (artifacts.length === 0) throw new Error(`no session artifact for ${sessionId}`);
  const text = decodeSessionArtifact(artifacts.at(-1)!);
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SessionLogEvent);
}

/** Ids of every persisted harness session under `dshHome/sessions` (one directory per session). */
export function listSessionIds(dshHome: string): string[] {
  const root = join(dshHome, 'sessions');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .flatMap((project) => {
      const dir = join(root, project);
      return statSync(dir).isDirectory()
        ? readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory())
        : [];
    })
    .sort();
}
