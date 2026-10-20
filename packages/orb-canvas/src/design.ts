/**
 * Design frame files (BUILD_PLAN P3.8): every write of a design card's HTML also lands in
 * `<canvas>/assets/design/<cardId>.html`, written here by the canvas service (agents never get file tools). The file
 * is the frame's copy in the canvas folder (the user can open it; Port snapshots it at export); the board renders the
 * HTML from the card data, in a sandboxed `srcdoc` iframe.
 *
 * Writes are atomic: the HTML goes to a dot-named temp file in the same folder, is fsynced, then renamed over the
 * old version (a rename replaces a symlink planted at the target instead of following it). The `assets/design`
 * folder must be a real directory, never a symlink out of the canvas. The asset file route
 * (orb-host `api/orb-asset/file`) only serves files directly inside `assets/` with an accepted type, so these HTML
 * files are never served to the app origin.
 */
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open as openFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DESIGN_DIR, DESIGN_HTML_MAX, OrbErrorCode, designAssetPath } from '@orb/shared';
import { CanvasError } from './errors.js';

const CARD_ID = /^c_[A-Za-z0-9_-]{1,60}$/;

/** Write (or rewrite) the HTML file of design card `cardId` in `canvasDir`. Returns its `assets/design/…` path. */
export async function writeDesignFile(canvasDir: string, cardId: string, html: string): Promise<string> {
  if (!CARD_ID.test(cardId)) throw new CanvasError(OrbErrorCode.invalidArgs, 'invalid design card id', {});
  if (html.length === 0 || html.length > DESIGN_HTML_MAX)
    throw new CanvasError(
      OrbErrorCode.invalidArgs,
      `design HTML must be 1 to ${DESIGN_HTML_MAX} characters`,
      {},
    );
  const dir = join(canvasDir, DESIGN_DIR);
  await mkdir(dir, { recursive: true });
  for (const d of [join(canvasDir, 'assets'), dir]) {
    const st = await lstat(d);
    if (!st.isDirectory() || st.isSymbolicLink())
      throw new CanvasError(OrbErrorCode.invalidArgs, `${DESIGN_DIR} is not a folder of this canvas`, {});
  }
  const path = designAssetPath(cardId);
  const target = join(canvasDir, path);
  const tmp = join(dir, `.design-${randomBytes(8).toString('hex')}.tmp`);
  const fh = await openFile(tmp, 'wx', 0o644);
  let kept = false;
  try {
    await fh.writeFile(html, 'utf8');
    await fh.sync();
    await fh.close();
    await rename(tmp, target);
    kept = true;
    const dh = await openFile(dir, 'r');
    try {
      await dh.sync();
    } catch {
      // some filesystems refuse fsync on a directory
    } finally {
      await dh.close();
    }
    return path;
  } finally {
    if (!kept) {
      await fh.close().catch(() => undefined);
      await rm(tmp, { force: true });
    }
  }
}

/** Remove the HTML file of a design card that was never placed (a failed first write). */
export async function removeDesignFile(canvasDir: string, cardId: string): Promise<void> {
  if (!CARD_ID.test(cardId)) return;
  await rm(join(canvasDir, designAssetPath(cardId)), { force: true });
}
