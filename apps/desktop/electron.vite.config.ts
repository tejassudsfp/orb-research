import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: 'src/main/index.ts' },
      // P5.4: main bundles the workspace code it imports (@orb/shared, @orb/sources/policy and their zod/ipaddr.js),
      // so the packaged app.asar needs no node_modules of its own. Electron and node: builtins stay external.
      externalizeDeps: { exclude: ['@orb/shared', '@orb/sources'] },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: 'src/preload/index.ts',
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
});
