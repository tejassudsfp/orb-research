# Contributing to orb

Focused fixes, reproducible bug reports, documentation and research-workflow examples are welcome.
For a substantial change, open an issue explaining the user problem and proposed behavior first.
Use invented or public sample data when reporting bugs. Redact credentials, account details and private board content.

## Set up

Use an Apple silicon Mac running macOS 14 or later, Node.js 22.19+ and pnpm 10.34.7.
See [Getting started](docs/GETTING_STARTED.md) for installation and first-run steps.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development app uses `.orb-dev/` for isolated state. Tests use temporary homes and mock providers;
you do not need a paid model account to run them. Real provider calls are opt-in and may incur charges.

## Before a pull request

```sh
pnpm build
pnpm test
pnpm lint
pnpm release:check
```

Run the relevant Electron tests for interactive changes. For privacy, provider or harness changes also run
`pnpm egress-audit --mode deterministic`. Explain what changed, why, and which checks passed. Include
a screenshot for a visible change, captured from a synthetic board. Keep commits focused and avoid generated
build outputs, private logs, credentials and research data.

## Architecture rules

- The canvas service is the sole writer of `board.jsonl`.
- Research agents receive scoped board/source tools. They receive no shell or general filesystem tools.
- Harness imports stay within `orb-host`, `orb-agents` and `orb-canvas`.
- Credentials belong in the macOS Keychain. Do not add telemetry or unapproved network destinations.
- Preserve exact Electron and `@deepseek-ai/*` pins.
- Themes come from `packages/shared/src/appearance/`; the app and website share these tokens.

Read [architecture](docs/ARCHITECTURE.md), [CLAUDE.md](CLAUDE.md) and the engineering documents linked in
[the documentation index](docs/README.md). The existing numbered task convention is `P6.<n>: <summary>`;
update the phase plan and progress log for implementation tasks. Build and tests must pass before committing.

Contributions are made under the [MIT License](LICENSE). By contributing, you confirm that you have the
right to submit the work. Respect the [Code of Conduct](CODE_OF_CONDUCT.md).
