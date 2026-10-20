# Themes and visual identity

Open **Settings → Appearance**. Style, accent and brightness are independent and saved locally.

- **Studio:** a neutral, compact workspace.
- **Paper:** an editorial surface with serif headings.
- **Pebble:** soft shapes and rounded typography.
- **Postcard:** stronger outlines and a printed-page feel.
- **Meadow:** warm surfaces and expressive headings.
- **Tide:** clear typography with distinctive chrome.

Each style supports Light, Dark and System. Choose one of eight accent presets or a custom hex color. Switching
appearance preserves the active board and research session.

## Modify the design

`packages/shared/src/appearance/registry.ts` defines palettes, geometry and font choices. `accent.ts` resolves
independent accent seeds, while `palette.ts` and `index.ts` produce the app's rendered CSS variables. The website
imports that same engine. Edit these shared definitions to change both products consistently.

Application components use `--orb-*` variables rather than hard-coded colors. Fonts are bundled locally. Use the
appearance tests when changing tokens; check text contrast, charts, diagrams, readers and export output in both modes.
The public site has its own responsive layout but shares the theme engine and typefaces.

The six-style system is adapted from [Symplist](https://github.com/tejassudsfp/symplist), with its
[MIT notice](../apps/ui/public/licenses/symplist.txt) retained. The Constellation mark and lowercase **orb** wordmark
are generated from `apps/ui/src/brand/marks.ts`; run `pnpm brand` after changing the canonical geometry.
