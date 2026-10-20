import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * pdf.js reads the 14 standard PDF fonts (for PDFs that do not embed them) from `standardFontDataUrl`. Bundle them
 * locally (dist/pdfjs/standard_fonts/, ~0.8 MB) so no font is ever fetched from the network.
 */
function pdfjsStandardFonts(): Plugin {
  const dir = join(
    dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  );
  return {
    name: 'orb-pdfjs-standard-fonts',
    apply: 'build',
    generateBundle() {
      for (const file of readdirSync(dir)) {
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/standard_fonts/${file}`,
          source: readFileSync(join(dir, file)),
        });
      }
    },
  };
}

// Served by the dsh sidecar (dsh-host-frontend-static), which injects <base href="./">,
// so every asset URL must be relative.
export default defineConfig({
  base: './',
  plugins: [react(), pdfjsStandardFonts()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // The sidecar's static server knows `.js` but not `.mjs` (dsh-host-frontend-static/lib/index.js:24-33), and a
        // module worker needs a JavaScript MIME type: emit the bundled pdf.js worker (`?url` asset) as `.js`.
        assetFileNames: (asset) =>
          (asset.names?.[0] ?? '').endsWith('.mjs')
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
