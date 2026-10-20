/// <reference lib="dom" />
/**
 * P5.4: the packaged app, installed from the dmg the way a user would (offline and deterministic; `pnpm e2e:packaged`
 * after `pnpm dist`).
 *
 *   1. The dmg mounts; Orb.app is copied out to a temp "Applications" folder (never /Applications) and the dmg is
 *      ejected. The copy is ad-hoc signed with the hardened runtime and Orb's entitlements (signing and notarisation
 *      are deferred), and carries the sidecar tree, the profile template and the UI as plain files in Resources.
 *   2. It launches (Playwright on the packaged executable): the sidecar is the app's own binary running the dsh in
 *      the bundle, DSH_HOME is created under userData, the window moves from the warming-up page to the live UI on
 *      127.0.0.1, and a fresh install shows the first-run sheet.
 *   3. Keychain: a provider key saved in Settings goes into the Keychain (read back by the packaged binary itself),
 *      the sidecar sends it to the provider (a custom provider on the local mock LLM), and no file holds it.
 *   4. An Orb turn runs end to end on that provider and the canvas lands in the Orb folder.
 *   5. Quit: the sidecar stops and the app exits.
 *
 * Isolation: Electron's `--user-data-dir` stands in for ~/Library/Application Support/Orb, and a Settings › Storage
 * pointer (location.json, P5.3) in it points the Orb folder at a temp dir, so the real ~/Orb is never touched. The
 * Keychain service is a throwaway `ai.orb.app.test.*` one, cleared with the packaged binary (items belong to the
 * binary that made them). The packaged app writes its sidecar log to ~/Library/Logs/Orb/sidecar.log (token-redacted).
 */
import { liveWindow } from '../e2e/support/ui.ts';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  clearTestKeychain,
  keychainMatches,
  packagedKeychainRuntime,
  type KeychainRuntime,
} from '../../../scripts/testkit/keychain.ts';
import { MockLlm, MOCK_MODEL, MOCK_MODEL_ALT } from '../../../scripts/testkit/mockLlm.ts';
import { testKeychainPrefix } from '../../../scripts/testkit/namespace.ts';
import { reportPlanFromFrames } from '@orb/shared';
import { REPORT_SAMPLE } from '../../../scripts/testkit/reportFixture.ts';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const version = JSON.parse(readFileSync(join(repo, 'apps', 'desktop', 'package.json'), 'utf8'))
  .version as string;
const dmg = process.env.ORB_DMG ?? join(repo, 'release', 'dist', `orb-${version}-arm64.dmg`);
const keychainService = `${testKeychainPrefix()}packaged-${process.pid}`;
const providerKey = `sk-pk-${randomBytes(20).toString('hex')}`;
const keyRef = 'ORB_PACKAGED_LLM_API_KEY';
const currentModel = 'new-provider-model-not-in-the-bundled-catalog';
let advertiseCurrentModel = false;

let tmp: string;
let appPath: string;
let userData: string;
let orbHome: string;
let runtime: KeychainRuntime;
let llm: MockLlm;
let app: ElectronApplication | undefined;
let page: Page;
let stdout = '';
let homeOrbBefore: boolean;
let sidecarPid: number;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue; // Provider registration removes transient lock files while Settings is open.
    if (st.isDirectory()) out.push(...filesUnder(p));
    else if (st.isFile()) out.push(p);
  }
  return out;
}

/** The sidecar: the child of the app's main process that runs dsh's bin. */
function sidecarProcess(mainPid: number): { pid: number; command: string } | undefined {
  const ps = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' });
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m && Number(m[2]) === mainPid && m[3]!.includes('@deepseek-ai/dsh/lib/bin.js'))
      return { pid: Number(m[1]), command: m[3]! };
  }
  return undefined;
}

/** `codesign` prints its details on stderr. */
function codesign(args: string[]): { status: number; out: string } {
  const r = spawnSync('codesign', args, { encoding: 'utf8' });
  return { status: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(process.platform !== 'darwin', 'macOS only');
  if (!existsSync(dmg)) throw new Error(`no dmg at ${dmg}: run \`pnpm dist\` first (or set ORB_DMG)`);
  tmp = mkdtempSync(join(tmpdir(), 'orb-packaged-'));
  const mount = join(tmp, 'mnt');
  mkdirSync(mount);
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', mount], {
    stdio: 'ignore',
  });
  try {
    expect(existsSync(join(mount, 'orb.app'))).toBe(true);
    // The dmg's drag-to-install target.
    expect(existsSync(join(mount, 'Applications'))).toBe(true);
    mkdirSync(join(tmp, 'Applications'));
    appPath = join(tmp, 'Applications', 'orb.app');
    execFileSync('ditto', [join(mount, 'orb.app'), appPath]);
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-force'], { stdio: 'ignore' });
  }
  userData = join(tmp, 'userData');
  orbHome = join(tmp, 'Orb');
  mkdirSync(userData);
  mkdirSync(orbHome);
  writeFileSync(join(userData, 'location.json'), `${JSON.stringify({ v: 1, orbHome })}\n`);
  homeOrbBefore = existsSync(join(homedir(), 'orb'));
  runtime = packagedKeychainRuntime(appPath);
  await clearTestKeychain(keychainService, runtime);
  llm = await new MockLlm({
    models: () => ({
      body: {
        data: [{ id: MOCK_MODEL }, { id: advertiseCurrentModel ? currentModel : MOCK_MODEL_ALT }],
      },
    }),
  }).start();
});

test.afterAll(async () => {
  await app?.close().catch(() => undefined);
  if (runtime) await clearTestKeychain(keychainService, runtime).catch(() => undefined);
  await llm?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('the dmg installs a signed orb.app with the hardened runtime and the sidecar files', () => {
  const verify = codesign(['--verify', '--deep', '--strict', appPath]);
  expect(verify.status, verify.out).toBe(0);
  const details = codesign(['-dv', '--verbose=2', appPath]).out;
  expect(details).toContain('Identifier=ai.orb.app');
  const entitlements = codesign(['-d', '--entitlements', ':-', appPath]).out;
  expect(entitlements).toContain('com.apple.security.cs.allow-jit');
  expect(entitlements).not.toContain('allow-unsigned-executable-memory');
  if (details.includes('Authority=Developer ID Application')) {
    // Release build (pnpm release:mac): one Team ID across the app and its addons, so library validation stays on.
    expect(details).toMatch(/flags=0x10000\(runtime\)/);
    expect(details).toContain('TeamIdentifier=Q78J7L8TLR');
    expect(entitlements).not.toContain('disable-library-validation');
  } else {
    // Local ad-hoc build (pnpm dist:adhoc): no Team ID, so library validation is off for the native addons.
    expect(details).toMatch(/flags=0x10002\(adhoc,runtime\)/);
    expect(entitlements).toContain('disable-library-validation');
  }
  // The unused LibreOffice engine is not shipped (scripts/dist-stage.ts EXCLUDED_OPTIONAL).
  expect(existsSync(join(appPath, 'Contents/Resources/node_modules/@deepseek-ai/libreoffice-kit-darwin-arm64'))).toBe(
    false,
  );
  // A native addon of the sidecar is signed too (the hardened runtime loads it).
  const keyring = join(
    appPath,
    'Contents/Resources/node_modules/@napi-rs/keyring-darwin-arm64/keyring.darwin-arm64.node',
  );
  expect(codesign(['--verify', keyring]).status).toBe(0);

  const info = readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8');
  expect(info).toMatch(/<key>CFBundleIdentifier<\/key>\s*<string>ai\.orb\.app<\/string>/);
  expect(info).toMatch(/<key>CFBundleShortVersionString<\/key>\s*<string>[\d.]+<\/string>/);
  // P6.1b: the name macOS shows (menu bar, Dock, Finder, About) is lowercase "orb"; the Constellation icon ships.
  expect(info).toMatch(/<key>CFBundleName<\/key>\s*<string>orb<\/string>/);
  expect(info).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>orb<\/string>/);
  expect(info).toMatch(/<key>CFBundleExecutable<\/key>\s*<string>orb<\/string>/);
  expect(info).toMatch(/<key>CFBundleIconFile<\/key>\s*<string>icon\.icns<\/string>/);
  expect(existsSync(join(appPath, 'Contents', 'Resources', 'icon.icns'))).toBe(true);
  const res = join(appPath, 'Contents', 'Resources');
  for (const file of [
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
    'node_modules/@orb/bundle/package.json',
    'node_modules/@orb/bundle/cordis.patch.yml',
    'node_modules/@orb/host/lib/index.js',
    'node_modules/node-addon-require-builtin-darwin-arm64/prebuilt/darwin-arm64-napi-v9.node',
    'profiles/orb/cordis.patch.yml',
    'ui/index.html',
    'app.asar',
  ])
    expect(existsSync(join(res, file)), file).toBe(true);
  expect(readFileSync(join(res, 'node_modules/@orb/bundle/cordis.patch.yml'), 'utf8'))
    .toContain('id: orb-compaction');
  expect(readFileSync(join(res, 'profiles/orb/cordis.patch.yml'), 'utf8'))
    .toContain('id: orb-compaction');
  expect(existsSync(join(res, 'node_modules/@orb/agents/lib/compaction.js'))).toBe(true);
  // No workspace sources or dev tools in the sidecar tree.
  expect(existsSync(join(res, 'node_modules/@orb/host/src'))).toBe(false);
  for (const dev of ['electron', 'vite', 'typescript', '@playwright/test', 'vitest', 'electron-builder'])
    expect(existsSync(join(res, 'node_modules', dev)), dev).toBe(false);
});

test('launches: the bundled sidecar boots, DSH_HOME is in userData, the live UI shows the first-run sheet', async () => {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete env.ORB_SKIP_FIRST_RUN;
  app = await electron.launch({
    executablePath: join(appPath, 'Contents', 'MacOS', 'orb'),
    args: [`--user-data-dir=${userData}`],
    env: { ...env, ORB_KEYCHAIN_SERVICE: keychainService },
  });
  app.process().stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
  page = await liveWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('first-run-screen')).toBeVisible();
  await expect(page.getByTestId('chatgpt-plan-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT', exact: true })).toBeVisible();

  expect(existsSync(join(userData, 'dsh', 'profiles', 'orb', 'cordis.patch.yml'))).toBe(true);
  expect(existsSync(join(orbHome, 'orb.json'))).toBe(true);
  // The sidecar is the app's own executable running the bundled dsh.
  const sidecar = sidecarProcess(app.process().pid!);
  expect(sidecar).toBeDefined();
  sidecarPid = sidecar!.pid;
  const command = sidecar!.command;
  expect(command).toContain(join(appPath, 'Contents', 'MacOS', 'orb'));
  expect(command).toContain(join(appPath, 'Contents', 'Resources', 'node_modules', '@deepseek-ai', 'dsh'));
  // The token URL never reaches the app's output or the packaged sidecar log (~/Library/Logs/orb).
  expect(stdout).not.toMatch(/token=/);
  const sidecarLog = readFileSync(join(homedir(), 'Library', 'Logs', 'orb', 'sidecar.log'), 'utf8');
  expect(sidecarLog).toContain(`spawned sidecar pid ${sidecarPid}`);
  expect(sidecarLog).not.toMatch(/token=(?!<redacted>)/);

  await page.getByTestId('first-run-continue').click();
  await expect(page.getByTestId('home-screen')).toBeVisible();
});

test('Keychain: a saved key is stored in the Keychain, reaches the provider, and is in no file', async () => {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('about-orb')).toHaveText(`orb ${version}`);
  await expect(page.getByTestId('about-runtime')).toContainText('Electron 44.7.0');
  await expect(page.getByTestId('storage-path')).toHaveText(orbHome);
  await expect(page.getByTestId('provider-cards')).toHaveAttribute('data-loaded', 'yes');
  await page.getByTestId('custom-add').click();
  await page.getByTestId('custom-id').fill('packaged-llm');
  await page.getByTestId('custom-label').fill('Packaged LLM');
  await page.getByTestId('custom-baseurl').fill(llm.baseURL);
  await page.getByTestId('custom-discover').click();
  await expect(page.getByTestId('custom-found')).toHaveText('Found 2 models.');
  await page.getByTestId('custom-nokey').uncheck();
  await page.getByTestId('custom-key').fill(providerKey);
  await page.getByTestId('custom-save').click();
  const card = page.locator('[data-testid="provider-card"][data-provider="packaged-llm"]');
  await expect(card.getByTestId('provider-status')).toHaveText('Working');
  // The new model appears only after Save: runtime registration must come from refresh, not manual declarations.
  expect(JSON.parse(readFileSync(join(orbHome, 'orb.json'), 'utf8')).customProviders[0].models).not.toContain(
    currentModel,
  );
  advertiseCurrentModel = true;
  await expect(card.getByTestId('provider-models-refresh')).toBeEnabled();
  await card.getByTestId('provider-models-refresh').click();
  await expect(card.getByTestId('provider-models-refresh')).toBeEnabled();
  await expect(card.getByTestId('provider-models-status')).toHaveText(/3 models · updated/);
  expect(llm.modelListRequests.at(-1)!.authorization).toBe(`Bearer ${providerKey}`);
  // The sidecar read the key back from the Keychain for the test request.
  expect(llm.requests.at(-1)!.authorization).toBe(`Bearer ${providerKey}`);
  expect(await keychainMatches(keychainService, keyRef, providerKey, runtime)).toBe(true);
  expect(await page.content()).not.toContain(providerKey);
  for (const file of [...filesUnder(userData), ...filesUnder(orbHome)]) {
    try {
      const info = statSync(file, { throwIfNoEntry: false });
      if (!info || info.size > 64 << 20) continue;
      expect(readFileSync(file).includes(providerKey), file).toBe(false);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
});

test('an Orb turn runs on that provider and the canvas lands in the Orb folder', async () => {
  const orbModel = page.locator('[data-testid="agent-model"][data-agent="orb"] select');
  await page.getByRole('searchbox', { name: 'Find a model' }).fill(currentModel);
  await orbModel.selectOption(`packaged-llm\u0001${currentModel}`);
  await expect
    .poll(() => JSON.parse(readFileSync(join(orbHome, 'orb.json'), 'utf8')).models?.orb)
    .toEqual({ provider: 'packaged-llm', model: currentModel });
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  const before = llm.requests.length;
  llm.enqueue(
    { toolCalls: [{ id: 'packaged_frame', name: 'add_frame', arguments: { title: 'Packaged research section' } }] },
    { text: '## Packaged reply\n\n**Formatted evidence**\n\n- First finding\n- Next step\n\n```txt\nSaved code\n```' },
  );
  await page.getByTestId('home-prompt').fill('Packaged app check');
  await page.getByTestId('orb-create').click();
  const screen = page.getByTestId('canvas-screen');
  await expect(screen).toHaveAttribute('data-canvas-id', /.+/);
  const panel = page.locator('[data-testid="chat-panel"], [data-testid="chat-pill"]').first();
  await expect(panel).toHaveAttribute('data-turn', 'completed', { timeout: 30_000 });
  const rail = (await page.getByTestId('chat-panel').boundingBox())!;
  const boardBounds = (await screen.boundingBox())!;
  expect(boardBounds.x + boardBounds.width).toBeCloseTo(rail.x, 0);
  expect(rail.height).toBe((await page.getByTestId('canvas-workspace').boundingBox())!.height);
  await page.getByTestId('chat-minimise').click();
  await expect(page.getByTestId('chat-pill')).toBeFocused();
  expect((await screen.boundingBox())!.width).toBeGreaterThan(boardBounds.width + 300);
  await page.getByTestId('chat-pill').click();
  await expect(page.getByTestId('orb-chat-input')).toBeFocused();
  const progress = page.getByTestId('research-coverage');
  const progressToggle = progress.getByRole('button', { name: /0\/1 sections filled/ });
  await expect(progressToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('chat-body').getByTestId('research-coverage')).toHaveCount(0);
  await progressToggle.click();
  await expect(page.getByTestId('research-progress-details')).toContainText('Detailed analysis pending');
  expect(await progress.innerText()).not.toMatch(/No substantive|update_card|upsert_rows/);
  await progressToggle.click();
  await page.getByTestId('orb-frame-label').click();
  await page.getByTestId('selection-delete').click();
  await expect(page.getByTestId('orb-frame')).toHaveCount(0);
  expect(llm.requests.length).toBeGreaterThan(before);
  expect(llm.requests.at(-1)!.authorization).toBe(`Bearer ${providerKey}`);
  expect(llm.requests.at(-1)!.body.model).toBe(currentModel);
  // The completion guard can add further mock replies. Verify the formatted reply wherever it sits in history.
  const reply = page
    .getByTestId('chat-body')
    .locator('[data-markdown]')
    .filter({
      has: page.getByRole('heading', { name: 'Packaged reply', exact: true }),
    });
  await expect(reply.locator('h4')).toHaveText('Packaged reply');
  await expect(reply.locator('strong')).toHaveText('Formatted evidence');
  await expect(reply.locator('ul li')).toHaveCount(2);
  await expect(reply.locator('pre code')).toHaveText('Saved code\n');
  const canvasId = (await screen.getAttribute('data-canvas-id'))!;
  expect(existsSync(join(orbHome, 'canvases', canvasId, 'board.jsonl'))).toBe(true);
  await page.getByTestId('tool-add-card').click();
  await page.getByTestId('add-card-note').click();
  await expect(page.getByTestId('reader')).toBeVisible();
  const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
  expect(await page.getByTestId('reader').getByRole('dialog').boundingBox()).toEqual(viewport);
  const noteId = (await page.getByTestId('reader').getAttribute('data-card-id'))!;
  expect(noteId).toMatch(/^c_/);
  await page.getByTestId('reader-note-title').fill('Full-screen packaged reader');
  await page.getByTestId('reader-note-body').fill(Object.values(REPORT_SAMPLE).flat().join('\n\n'));
  await page.getByTestId('reader-badge-must').click();
  await page.getByTestId('reader-close').click();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  const reading = page.getByTestId('chat-panel').getByTestId('reading-queue');
  await expect(reading.getByTestId('reading-queue-toggle')).toHaveAttribute('aria-expanded', 'false');
  await reading.getByTestId('reading-queue-toggle').click();
  await expect(reading.getByTestId('reading-queue-item')).toHaveAttribute('data-card-id', noteId);
  // An ordinary card click opens the actual packaged reader; selection is explicit and never opens it.
  const savedCard = page.locator(`[data-testid="orb-card"][data-card-id="${noteId}"]`);
  await savedCard.getByTestId('card-select').check();
  await expect(page.getByTestId('reader')).toHaveCount(0);
  await savedCard.getByTestId('orb-card-title').click();
  await expect(page.getByTestId('reader')).toHaveAttribute('data-card-id', noteId);
  expect(await page.getByTestId('reader').getByRole('dialog').boundingBox()).toEqual(viewport);
  await page.getByTestId('reader-close').click();
  const plan = reportPlanFromFrames([{ id: null, title: 'Additional findings from the open board' }]);
  llm.enqueue(
    {
      toolCalls: [1, 2, 3].map((n) => ({
        id: `inspect_note_${n}`,
        name: 'read_card',
        arguments: { cardId: noteId, page: n },
      })),
    },
    {
      toolCalls: plan.map((section, i) => ({
        id: `packaged_section_${i}`,
        name: 'compose_section',
        arguments: {
          sectionId: section.id,
          heading: section.heading,
          paragraphs: (
            REPORT_SAMPLE[section.id as keyof typeof REPORT_SAMPLE] ?? REPORT_SAMPLE['commercial-assessment']
          ).map((text) => ({ text, cardIds: [noteId] })),
        },
      })),
    },
    { text: 'The packaged research report is complete.' },
  );
  await page.getByTestId('publish-port').click();
  await page.getByTestId('composer-mode').locator('[data-value="doc"]').click();
  await expect(page.getByTestId('composer-document-format')).toHaveValue('report');
  await page.getByTestId('composer-compose').click();
  await expect(page.getByTestId('composer-progress')).toHaveAttribute('data-phase', 'composed');
  await expect(page.getByTestId('composer-export')).toBeEnabled();
  expect(
    JSON.parse(readFileSync(join(orbHome, 'canvases', canvasId, 'port', 'citations.json'), 'utf8')).format,
  ).toBe('report');
  await page.getByTestId('composer-reading-view').click();
  await expect(page.getByTestId('port-contents').getByRole('button')).toHaveCount(5);
});

test('quits cleanly: the sidecar stops and the app exits; the real ~/orb is untouched', async () => {
  const mainPid = app!.process().pid!;
  await app!.close();
  app = undefined;
  await expect.poll(() => alive(sidecarPid), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => alive(mainPid), { timeout: 10_000 }).toBe(false);
  expect(stdout).toMatch(/sidecar exited \(code 0, signal null\)/);
  expect(existsSync(join(homedir(), 'orb'))).toBe(homeOrbBefore);
});
