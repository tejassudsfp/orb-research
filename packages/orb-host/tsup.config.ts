import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/web-shell.ts', 'src/remote.ts', 'src/keychain.ts', 'src/models.ts', 'src/cost.ts'],
  format: ['esm'],
  outDir: 'lib',
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  // Never minify: the gateway's SRC fallback reads Remote parameter names from Function.prototype.toString.
  minify: false,
  keepNames: true,
});
