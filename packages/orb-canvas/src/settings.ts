/**
 * `<ORB_HOME>/orb.json`: app settings (BUILD_PLAN P2.6, PRD Local storage). No secrets, ever: keys live in the
 * Keychain. Written atomically (temp file, fsync, rename); writes are serialized. A missing or unreadable file reads as
 * the defaults (an unreadable one is left in place until the next write replaces it).
 */
import { mkdir, open as openFile, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OrbSettings, OrbSettingsPatch, appearanceFromSettings } from '@orb/shared';
import { CanvasError } from './errors.js';

export const SETTINGS_FILE = 'orb.json';

export class SettingsStore {
  readonly path: string;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    home: string,
    private readonly log?: (level: 'info' | 'warn' | 'error', message: string) => void,
  ) {
    this.path = join(home, SETTINGS_FILE);
  }

  async get(): Promise<OrbSettings> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return OrbSettings.parse({});
      throw err;
    }
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      // Unknown keys (a newer Orb) are dropped by the schema; bad values fall back to their defaults one by one.
      const out = OrbSettings.parse({});
      for (const key of Object.keys(OrbSettings.shape) as (keyof OrbSettings)[]) {
        const field = OrbSettings.shape[key].safeParse(value[key]);
        if (field.success) (out as Record<string, unknown>)[key] = field.data;
      }
      out.appearance = appearanceFromSettings(value);
      return out;
    } catch {
      this.log?.('warn', 'orb-canvas: orb.json is not valid JSON; using default settings');
      return OrbSettings.parse({});
    }
  }

  /** Merge a patch into orb.json and return the new settings. */
  set(patch: unknown): Promise<OrbSettings> {
    const parsed = OrbSettingsPatch.safeParse(patch);
    if (!parsed.success) {
      return Promise.reject(
        new CanvasError(
          'orb/invalid-args',
          `invalid settings: ${parsed.error.issues[0]?.message ?? 'bad value'}`,
        ),
      );
    }
    const { models, appearance, ...rest } = parsed.data;
    return this.update((current) => {
      // `models` merges per role: a patch naming one agent's model keeps the others; `null` clears a role (default).
      const nextModels: Record<string, unknown> = { ...current.models };
      for (const [role, route] of Object.entries(models ?? {})) {
        if (route === null) delete nextModels[role];
        else if (route !== undefined) nextModels[role] = route;
      }
      const nextAppearance = {
        ...current.appearance,
        ...(rest.theme ? { mode: rest.theme === 'day' ? ('light' as const) : ('dark' as const) } : {}),
        ...appearance,
      };
      return {
        ...current,
        ...rest,
        theme:
          nextAppearance.mode === 'light' ? 'day' : nextAppearance.mode === 'dark' ? 'night' : current.theme,
        appearance: nextAppearance,
        models: nextModels as OrbSettings['models'],
      };
    });
  }

  /**
   * Read-modify-write orb.json under the write chain (P4.2: orb-host's custom providers). `change` gets the current
   * settings and returns the next ones, which are validated before anything is written.
   */
  update(change: (current: OrbSettings) => OrbSettings): Promise<OrbSettings> {
    const run = this.writes
      .catch(() => undefined)
      .then(async () => {
        const next = OrbSettings.parse(change(await this.get()));
        await mkdir(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.${process.pid}.tmp`;
        const fh = await openFile(tmp, 'w', 0o644);
        try {
          await fh.writeFile(`${JSON.stringify(next, null, 2)}\n`);
          await fh.sync();
        } finally {
          await fh.close();
        }
        await rename(tmp, this.path);
        return next;
      });
    this.writes = run;
    return run;
  }
}
