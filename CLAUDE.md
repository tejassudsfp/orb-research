# Orb — agent working rules

Orb v0 is a local-first Mac research canvas: Electron + React, with a DeepSeek Harness (dsh) sidecar running Orb's own plugins.

## Read first, in this order
1. `docs/PRD.md`: what to build (behaviour).
2. `docs/BUILD_PLAN.md`: how, and in what order (phases, tasks, gates).
3. `docs/DSH_DEEP_DIVE.md`: harness facts with file paths. The audit was done on 0.1.5-rc.2, and we pin **0.2.0-rc.2**.
   Its §9 lists the 0.2.0 deltas.
4. `docs/PROGRESS.md`: where the last agent stopped.
5. `design/screens/*.html`: the screen markup and styles to match. `design/Research Canvas Prototype.html` is the
   self-unpacking original; open it in a browser to see it live.

## Precedence
- PRD wins on behaviour.
- The prototype wins on look.
- The installed harness code (`node_modules/@deepseek-ai/*`) wins on harness facts. Docs can be stale; code is not.
- BUILD_PLAN wins on sequence.

## Hard rules
- **Agent tools.** Orb agents never get shell, terminal, code-execution, workflow, job or generic filesystem tools.
  Allow-lists live in BUILD_PLAN §2.4 and are enforced by `ctx.tools.guard`.
- **Board storage.** Board state lives only in `board.jsonl`, written only by the orb-canvas service.
  Never append custom event types to harness sessions: the harness refuses to reopen them.
- **No telemetry.** No telemetry, analytics or crash reporters. Never add a network destination other than configured providers
  and the URLs a user or Scout fetches. The egress audit must stay green.
  Owner-authorized exception (2026-10-19): `apps/site` may use consent-based PostHog website analytics.
  This exception does not apply to the desktop app, research UI or harness.
  Owner-authorized exception (2026-10-20): the website may send explicitly submitted bug reports and selected
  evidence through Resend to the fixed support inbox. Keep the sending key server-only; local development uses
  a separate `ai.orb.site` Keychain service, and hosted servers use a secret environment variable.
- **Secrets.** Never log or commit them. Keys live only in the Keychain. Never log the `dsh web:` token URL.
- **Harness seams.** Touch the harness only from `packages/orb-host`, `packages/orb-agents` and `packages/orb-canvas`.
- **Version pin.** Pin dependency versions exactly for `@deepseek-ai/*` and `electron`.

## Workflow
- Work BUILD_PLAN tasks in order. Make one commit per task, with the message `P<phase>.<n>: <summary>`.
- After each task, update `docs/PROGRESS.md` (status, date, deviations).
- Record every harness surprise in `docs/SPIKE_NOTES.md` (Phase 1) or `docs/HARNESS_NOTES.md` (later). Include the proving
  file path.
- When a harness API differs from the docs, follow the code, note it, and continue. Stop and report only when a gate
  criterion is impossible.
- `pnpm build && pnpm test` must be green before every commit.

## Local facts
- The dev harness home is `<repo>/.orb-dev/dsh` (gitignored). The dev board home is `<repo>/.orb-dev/Orb`.
- Inspect the composed tree with `pnpm dump-config`.
