# Public screenshots

These are captures of the real Electron app using an entirely invented community repair-café scenario.
Sources use reserved `example.org` addresses. Scores are explicitly illustrative judgments. No private boards,
subscriber accounts or real source fetches are used. The chat response is scripted through a local mock model.

- `workspace-<style>-<mode>.png`: the same workspace in all six styles and both modes, blue accent.
- `matrix.png`: the expanded comparison reader with detailed reasoning.
- `capture.json`: provenance and viewport dimensions.

To regenerate on a supported Mac:

```sh
pnpm build
pnpm screenshots
pnpm site:build
```

Review the images visually before committing. Preserve the synthetic-content caption in public use.
The fixture is `scripts/testkit/showcase.ts`; capture code is `apps/desktop/e2e/showcase.spec.ts`.
Historical development captures live in the ignored `docs/screens/` and `.orb-dev/` paths.
