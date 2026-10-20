import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/policy.ts'],
  format: ['esm'],
  outDir: 'lib',
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
});
