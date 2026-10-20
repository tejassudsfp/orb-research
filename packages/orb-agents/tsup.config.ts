import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/service.ts',
    'src/compaction.ts',
    'src/guard.ts',
    'src/persona.ts',
    'src/tools.ts',
  ],
  format: ['esm'],
  outDir: 'lib',
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
});
