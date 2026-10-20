import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/service.ts', 'src/tools.ts', 'src/sources.ts', 'src/web.ts', 'src/port.ts', 'src/parallel.ts', 'src/parallelTools.ts'],
  format: ['esm'],
  outDir: 'lib',
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  // tsup strips the `node:` prefix by default; `node:sqlite` (P2.6 search index) exists ONLY with the prefix.
  removeNodeProtocol: false,
});
