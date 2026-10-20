/**
 * `orb-keychain` (BUILD_PLAN P4.1): Orb's credential provider. It replaces dsh-base's `credentials` row
 * (`@deepseek-ai/dsh-credentials-local`, plaintext `$DSH_HOME/.credentials.yaml`) in orb-bundle's patch; the base row
 * is disabled there, so this is the one `ctx.credentials`.
 *
 * Layers, most trusted first:
 *   1. the inherited process environment: read-only and wins (a `OPENAI_API_KEY=… ` launch, the testkit's mock key).
 *      There is no `.env` layering: Orb does not read `.env` files.
 *   2. the macOS Keychain, service `ai.orb.app` (`@orb/keychain`): writable. A reference is the item whose account is
 *      its name; a record is the item `record:<scope>/<id>` holding JSON.
 *   3. only while a migration could not finish: the entries of a plaintext `.credentials.yaml` still on disk, read-only
 *      (so a failed Keychain write never loses a key; the next boot retries).
 *
 * Migration: at mount, before anything resolves, a plaintext `$DSH_HOME/.credentials.yaml` (left by dsh's local
 * provider) has every reference and record copied into the Keychain, each read back and compared, and only when all
 * of them landed is the file deleted. An entry the Keychain already holds with a different value keeps the Keychain
 * value (the newer store) and the file's copy is dropped with a warning naming only the reference.
 *
 * P6.2 (startup Keychain wait, P5.gate risk): the Keychain is read in the background. Mount waits for it at most
 * `bootWaitMs` (1.5 s): a normal read takes milliseconds and behaves as before (a failure fails the mount), but a
 * read held by a macOS access prompt ("orb wants to use your confidential information…") no longer holds the
 * sidecar: mount returns, the sidecar serves, and anything that needs a key waits for the read (`keychainStatus()`
 * says `waiting`; the warming-up and live Home tell the user to answer the prompt). The marker lines
 * `KEYCHAIN_WAITING_LINE` / `KEYCHAIN_READY_LINE` on stderr let Electron main tell the warming-up Home. The
 * gateway's cookie-signing record (`client-connection/browser-session`) is kept in process memory only, so the
 * gateway's own activation never waits on the Keychain; a new secret per sidecar process is fine for Orb (the window
 * loads each sidecar's token URL, and a restarted sidecar has a new port, i.e. a new cookie name anyway).
 *
 * Every committed change emits `credentials/reference-updated` (`notifyUpdated`) or `credentials/record-updated`
 * (`notifyRecordUpdated`), so consumers (llm-pi-ai routes, Orb's search providers) pick it up on the next request.
 * Values never reach a log line or an error message.
 */
import { readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Service } from '@deepseek-ai/cordis';
import {
  CredentialProvider,
  credentialRef,
  parseCredentialKey,
  type CredentialKey,
  type CredentialRecord,
  type CredentialRef,
  type ResolvedCredential,
  type CredentialInfo,
  type CredentialRecordInfo,
  type CredentialRecordEntry,
} from '@deepseek-ai/dsh-credentials';
import { parseCredentialsDocument, renderFlatLayoutMigration } from '@deepseek-ai/dsh-credentials-local';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { KEYCHAIN_READY_LINE, KEYCHAIN_WAITING_LINE } from '@orb/shared';
import {
  KeychainStore,
  parseAccount,
  recordAccount,
  refAccount,
  resolveKeychainService,
  type SecretStore,
} from '@orb/keychain';

export const name = 'orb-keychain';

/** How long mount waits for the Keychain before it lets the sidecar serve and keeps reading in the background. */
export const KEYCHAIN_BOOT_WAIT_MS = 1500;
/** After this long without an answer the Keychain is reported as waiting (a macOS prompt is likely open). */
export const KEYCHAIN_NOTICE_MS = 400;
/** stderr marker lines (no secrets) for Electron main: the read is waiting / done after waiting. */
export { KEYCHAIN_READY_LINE, KEYCHAIN_WAITING_LINE };

/** Records kept in this process only, never in the Keychain (see the header). */
export const PROCESS_ONLY_RECORDS: ReadonlySet<string> = new Set(['client-connection/browser-session']);

/** The Keychain read's state for the UI: `waiting` = still unanswered after KEYCHAIN_NOTICE_MS. */
export type KeychainStatus = { state: 'loading' | 'waiting' | 'ready' | 'failed'; waitingMs: number };

/** Basename of dsh's plaintext credentials document. */
export const PLAINTEXT_CREDENTIALS = '.credentials.yaml';

export type KeychainProviderConfig = {
  /** Keychain service; default `ai.orb.app` (or a test service from ORB_KEYCHAIN_SERVICE). */
  service?: string;
  /** Harness home holding a plaintext `.credentials.yaml` to migrate; default `$DSH_HOME` / `~/.dsh`. */
  dshHome?: string;
  /** Migrate (and delete) a plaintext document at mount. Default true. */
  migrate?: boolean;
  /** Test seam: the secret store (default: the Keychain service above). */
  store?: SecretStore;
  /** Test seam: the read-only environment layer (default: the launch environment's `process` layer). */
  env?: (ref: string) => string | undefined;
  /** Longest wait for the Keychain at mount (default KEYCHAIN_BOOT_WAIT_MS). */
  bootWaitMs?: number;
  /** Test seam: where the marker lines go (default: process.stderr). */
  notice?: (line: string) => void;
  /**
   * Test seam: delay the Keychain read by this many ms (simulates a pending access prompt). Also read from
   * ORB_KEYCHAIN_TEST_DELAY_MS, honoured only for a test service (`ai.orb.app.test.*`).
   */
  testDelayMs?: number;
};

/** Source ids reported by `describe` / `resolve`. */
export const SOURCE = { env: 'env', keychain: 'keychain', file: 'file' } as const;

export type MigrationReport = {
  /** References and records copied (or already present with the same value). */
  migrated: number;
  /** Entries the Keychain already held with another value (the Keychain value was kept). */
  conflicts: number;
  /** Whether the plaintext file was deleted. */
  deleted: boolean;
};

function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** The document's text upgraded from dsh's pre-release flat layout, when it is that layout. */
function versionedText(text: string): string {
  return renderFlatLayoutMigration(text) ?? text;
}

export default class OrbKeychainCredentialProvider extends CredentialProvider {
  readonly service: string;
  readonly plaintextPath: string;
  private readonly store: SecretStore;
  private readonly envLayer: (ref: string) => string | undefined;
  private readonly migrateOnMount: boolean;
  /** Keychain snapshot (write-through): reference name → value. */
  private refs = new Map<string, string>();
  /** Keychain snapshot (write-through): record key → record. */
  private records = new Map<string, CredentialRecord>();
  /** Read-only entries of a plaintext document whose migration did not finish. */
  private pendingRefs = new Map<string, string>();
  private pendingRecords = new Map<string, CredentialRecord>();
  /** Single exclusive write chain (settled tail), so a modifyRecord's read-decide-write is never interleaved. */
  private operations: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly loaded: Promise<void>;
  private markLoaded!: () => void;
  private failLoad!: (error: unknown) => void;
  private loadState: 'loading' | 'ready' | 'failed' = 'loading';
  private loadStartedAt = 0;
  private readonly bootWaitMs: number;
  private readonly notice: (line: string) => void;
  private readonly testDelayMs: number;
  /** Process-only records (PROCESS_ONLY_RECORDS), with their own write chain. */
  private processRecords = new Map<string, CredentialRecord>();
  private processOperations: Promise<unknown> = Promise.resolve();
  lastMigration: MigrationReport | undefined;

  constructor(ctx: any, config: KeychainProviderConfig = {}) {
    super(ctx);
    this.service = config.service ?? resolveKeychainService();
    this.plaintextPath = join(resolveDshHome(config.dshHome), PLAINTEXT_CREDENTIALS);
    this.store = config.store ?? new KeychainStore(this.service);
    this.migrateOnMount = config.migrate ?? true;
    this.envLayer =
      config.env ??
      ((ref) => {
        const entry = launchEnvironmentOf(ctx).getFrom(ref, ['process']);
        return entry !== undefined && entry.value.length > 0 ? entry.value : undefined;
      });
    this.bootWaitMs = config.bootWaitMs ?? KEYCHAIN_BOOT_WAIT_MS;
    this.notice = config.notice ?? ((line) => void process.stderr.write(`${line}\n`));
    const envDelay = Number(process.env.ORB_KEYCHAIN_TEST_DELAY_MS ?? 0);
    this.testDelayMs =
      config.testDelayMs ??
      (this.service.startsWith('ai.orb.app.test.') && Number.isFinite(envDelay) && envDelay > 0 ? envDelay : 0);
    this.loaded = new Promise<void>((resolve, reject) => {
      this.markLoaded = resolve;
      this.failLoad = reject;
    });
    // A failed load is reported to callers; never an unhandled rejection.
    this.loaded.catch(() => {});
  }

  async *[Service.init]() {
    yield async () => {
      this.closed = true;
      await this.operations.catch(() => {});
    };
    this.loadStartedAt = Date.now();
    let noticed = false;
    const noticeTimer = setTimeout(() => {
      noticed = true;
      this.notice(KEYCHAIN_WAITING_LINE);
    }, KEYCHAIN_NOTICE_MS);
    const work = (async () => {
      await this.load();
      if (this.migrateOnMount) await this.migrate();
    })().then(
      () => {
        clearTimeout(noticeTimer);
        this.loadState = 'ready';
        this.markLoaded();
        if (noticed) this.notice(KEYCHAIN_READY_LINE);
      },
      (error: unknown) => {
        clearTimeout(noticeTimer);
        this.loadState = 'failed';
        this.failLoad(error);
        throw error;
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = work.then(() => 'done' as const);
    // Observed by the race below; a failure after the race is reported through `loaded` instead.
    done.catch(() => {});
    const outcome = await Promise.race([
      done,
      new Promise<'waiting'>((resolve) => {
        timer = setTimeout(() => resolve('waiting'), this.bootWaitMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (outcome === 'waiting') {
      // The read goes on in the background; a later failure reaches every caller through `loaded`.
      work.catch((error: unknown) =>
        this.ctx
          .logger('orb-keychain')
          .error('the Keychain could not be read: %s', error instanceof Error ? error.name : 'error'),
      );
      this.ctx.logger('orb-keychain').warn('the Keychain has not answered yet; the sidecar starts without it');
    }
  }

  /** The Keychain read's state (P6.2): the Home screens show a hint while it is `waiting`. */
  keychainStatus(): KeychainStatus {
    const waitingMs = this.loadState === 'loading' ? Date.now() - this.loadStartedAt : 0;
    const state =
      this.loadState === 'loading' && this.loadStartedAt > 0 && waitingMs >= KEYCHAIN_NOTICE_MS
        ? 'waiting'
        : this.loadState;
    return { state, waitingMs };
  }

  /** Read the whole Keychain service once (values stay in this process). */
  private async load(): Promise<void> {
    if (this.testDelayMs > 0) await new Promise((r) => setTimeout(r, this.testDelayMs));
    const refs = new Map<string, string>();
    const records = new Map<string, CredentialRecord>();
    for (const { account, value } of await this.store.list()) {
      const parsed = parseAccount(account);
      if (parsed.kind === 'ref' && value.length > 0) refs.set(parsed.ref, value);
      else if (parsed.kind === 'record') {
        if (PROCESS_ONLY_RECORDS.has(parsed.key)) continue;
        try {
          parseCredentialKey(parsed.key);
          records.set(parsed.key, JSON.parse(value) as CredentialRecord);
        } catch {
          this.ctx.logger('orb-keychain').warn('ignoring an unreadable Keychain record item %s', parsed.key);
        }
      }
    }
    this.refs = refs;
    this.records = records;
  }

  /**
   * Move a plaintext `.credentials.yaml` into the Keychain, then delete it. Exposed for tests; runs at mount.
   * Every write is read back from the Keychain and compared before the file goes.
   */
  async migrate(): Promise<MigrationReport | undefined> {
    let text: string;
    try {
      text = await readFile(this.plaintextPath, 'utf8');
    } catch (error) {
      if (isENOENT(error)) return undefined;
      throw error;
    }
    const logger = this.ctx.logger('orb-keychain');
    // Parse with dsh's own reader (a typo or unknown field is an error, never a silently dropped key).
    const document = parseCredentialsDocument(versionedText(text), this.plaintextPath) as {
      refs: Map<string, string>;
      records: Map<string, CredentialRecord>;
    };
    let migrated = 0;
    let conflicts = 0;
    let failed = 0;
    const changedRefs: string[] = [];
    const changedRecords: string[] = [];
    for (const [ref, value] of document.refs) {
      const existing = await this.store.get(refAccount(ref));
      if (existing !== undefined && existing.length > 0 && existing !== value) {
        conflicts += 1;
        logger.warn('migration: the Keychain already holds %s; keeping the Keychain value', ref);
        continue;
      }
      if (existing !== value) await this.store.set(refAccount(ref), value);
      if ((await this.store.get(refAccount(ref))) === value) {
        if (this.refs.get(ref) !== value) changedRefs.push(ref);
        this.refs.set(ref, value);
        migrated += 1;
      } else {
        failed += 1;
        this.pendingRefs.set(ref, value);
        logger.error('migration: %s did not read back from the Keychain; the plaintext file is kept', ref);
      }
    }
    for (const [key, record] of document.records) {
      // A process-only record (the gateway's cookie secret) is not kept: dropped with the file.
      if (PROCESS_ONLY_RECORDS.has(key)) {
        migrated += 1;
        continue;
      }
      const json = JSON.stringify(record);
      const existing = await this.store.get(recordAccount(key));
      if (existing !== undefined && existing !== json) {
        conflicts += 1;
        logger.warn('migration: the Keychain already holds record %s; keeping the Keychain value', key);
        continue;
      }
      if (existing !== json) await this.store.set(recordAccount(key), json);
      if ((await this.store.get(recordAccount(key))) === json) {
        if (!this.records.has(key)) changedRecords.push(key);
        this.records.set(key, record);
        migrated += 1;
      } else {
        failed += 1;
        this.pendingRecords.set(key, record);
        logger.error(
          'migration: record %s did not read back from the Keychain; the plaintext file is kept',
          key,
        );
      }
    }
    let deleted = false;
    if (failed === 0) {
      await unlink(this.plaintextPath).catch((error: unknown) => {
        if (!isENOENT(error)) throw error;
      });
      // dsh-atomic-write's lock file, if a writer left one behind.
      await unlink(`${this.plaintextPath}.lock`).catch(() => {});
      deleted = await stat(this.plaintextPath).then(
        () => false,
        (error: unknown) => isENOENT(error),
      );
    }
    logger.info(
      'migrated %d plaintext credential entr%s into the Keychain (%d kept as already stored); plaintext file %s',
      migrated,
      migrated === 1 ? 'y' : 'ies',
      conflicts,
      deleted ? 'deleted' : 'kept',
    );
    for (const ref of changedRefs) this.notifyUpdated(credentialRef(ref));
    for (const key of changedRecords) this.notifyRecordUpdated(parseCredentialKey(key));
    this.lastMigration = { migrated, conflicts, deleted };
    return this.lastMigration;
  }

  private inherited(ref: string): string | undefined {
    return this.envLayer(ref);
  }

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const inherited = this.inherited(ref);
    if (inherited !== undefined) return { value: inherited, source: SOURCE.env };
    await this.loaded;
    const stored = this.refs.get(ref);
    if (stored !== undefined) return { value: stored, source: SOURCE.keychain };
    const pending = this.pendingRefs.get(ref);
    if (pending !== undefined) return { value: pending, source: SOURCE.file };
    return undefined;
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    if (this.inherited(ref) !== undefined) return { configured: true, source: SOURCE.env, writable: false };
    await this.loaded;
    if (this.refs.has(ref)) return { configured: true, source: SOURCE.keychain, writable: true };
    if (this.pendingRefs.has(ref)) return { configured: true, source: SOURCE.file, writable: true };
    return { configured: false, writable: true };
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`orb-keychain: an empty value cannot be stored for "${ref}"; use unset`);
    await this.writeRef(ref, value);
  }

  async unset(ref: CredentialRef): Promise<void> {
    await this.writeRef(ref, undefined);
  }

  private assertUnshadowed(ref: string, verb: string): void {
    if (this.inherited(ref) !== undefined)
      throw new Error(
        `orb-keychain: "${ref}" is supplied read-only by the launching environment, so ${verb} would be shadowed; unset it in the environment orb starts from instead`,
      );
  }

  private async writeRef(ref: CredentialRef, value: string | undefined): Promise<void> {
    const verb = value === undefined ? 'unset' : 'set';
    credentialRef(ref);
    if (this.closed) throw new Error(`orb-keychain is disposed: cannot ${verb} "${ref}"`);
    this.assertUnshadowed(ref, verb);
    await this.loaded;
    await this.enqueue(async () => {
      if (this.closed) throw new Error(`orb-keychain was disposed before the queued "${ref}" ${verb} ran`);
      this.assertUnshadowed(ref, verb);
      const had = this.refs.has(ref) || this.pendingRefs.has(ref);
      if (value === undefined) {
        if (!had) return;
        await this.store.delete(refAccount(ref));
        this.refs.delete(ref);
        this.pendingRefs.delete(ref);
      } else {
        if (this.refs.get(ref) === value) return;
        await this.store.set(refAccount(ref), value);
        this.refs.set(ref, value);
        this.pendingRefs.delete(ref);
      }
      this.notifyUpdated(ref);
    });
  }

  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    if (PROCESS_ONLY_RECORDS.has(key)) return this.processRecords.get(key);
    await this.loaded;
    return this.records.get(key) ?? this.pendingRecords.get(key);
  }

  async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const stored = await this.readRecord(key);
    if (stored === undefined) return { configured: false, writable: true };
    return { configured: true, kind: stored.kind, writable: true };
  }

  async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    await this.loaded;
    const all = new Map([...this.pendingRecords, ...this.records, ...this.processRecords]);
    return [...all].map(([key, record]) => ({ key: parseCredentialKey(key), kind: record.kind }));
  }

  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    parseCredentialKey(key);
    if (this.closed) throw new Error(`orb-keychain is disposed: cannot modify "${key}"`);
    if (PROCESS_ONLY_RECORDS.has(key)) {
      const task = this.processOperations.then(async () => {
        const current = this.processRecords.get(key);
        const next = await mutate(current);
        if (next === undefined) return current;
        assertStorableRecord(key, next);
        const stored = JSON.parse(JSON.stringify(next)) as CredentialRecord;
        this.processRecords.set(key, stored);
        this.notifyRecordUpdated(key);
        return stored;
      });
      this.processOperations = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    }
    await this.loaded;
    return this.enqueue(async () => {
      if (this.closed) throw new Error(`orb-keychain was disposed before the queued "${key}" modify ran`);
      const current = this.records.get(key) ?? this.pendingRecords.get(key);
      const next = await mutate(current);
      if (next === undefined) return current;
      assertStorableRecord(key, next);
      const json = JSON.stringify(next);
      await this.store.set(recordAccount(key), json);
      // Store what a reader will get back: the JSON round trip of the record.
      const stored = JSON.parse(json) as CredentialRecord;
      this.records.set(key, stored);
      this.pendingRecords.delete(key);
      this.notifyRecordUpdated(key);
      return stored;
    });
  }

  async deleteRecord(key: CredentialKey): Promise<void> {
    parseCredentialKey(key);
    if (this.closed) throw new Error(`orb-keychain is disposed: cannot delete "${key}"`);
    if (PROCESS_ONLY_RECORDS.has(key)) {
      if (this.processRecords.delete(key)) this.notifyRecordUpdated(key);
      return;
    }
    await this.loaded;
    await this.enqueue(async () => {
      if (this.closed) throw new Error(`orb-keychain was disposed before the queued "${key}" delete ran`);
      if (!this.records.has(key) && !this.pendingRecords.has(key)) return;
      await this.store.delete(recordAccount(key));
      this.records.delete(key);
      this.pendingRecords.delete(key);
      this.notifyRecordUpdated(key);
    });
  }

  /** Every reference the Keychain (or a pending plaintext document) holds; names only (for `keys.describe`). */
  async storedRefs(): Promise<string[]> {
    await this.loaded;
    return [...new Set([...this.refs.keys(), ...this.pendingRefs.keys()])].sort();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.operations.then(operation);
    this.operations = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

/** Refuse a record that could not be read back (same rules as dsh's local provider, without quoting values). */
function assertStorableRecord(key: string, record: CredentialRecord): void {
  if (record.kind === 'api-key') {
    if (record.key !== undefined && (typeof record.key !== 'string' || record.key.length === 0))
      throw new TypeError(`orb-keychain: record "${key}" has an empty key; omit the field instead`);
    for (const [envName, value] of Object.entries(record.env ?? {})) {
      credentialRef(envName);
      if (typeof value !== 'string' || value.length === 0)
        throw new TypeError(`orb-keychain: record "${key}" env "${envName}" must be a non-empty string`);
    }
    return;
  }
  if (record.kind === 'grant') {
    const json = JSON.stringify(record.payload);
    if (json === undefined) throw new TypeError(`orb-keychain: record "${key}" payload is not JSON`);
    return;
  }
  throw new TypeError(`orb-keychain: record "${key}" has an unknown kind`);
}
