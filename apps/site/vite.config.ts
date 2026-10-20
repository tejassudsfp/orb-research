import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBugReportHandler } from './server/bug-reports.js';
import { createDownloadFileHandler } from './server/download-file.js';
import { createDownloadRequestHandler } from './server/download-requests.js';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  base: './',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_POSTHOG_'],
  publicDir: '../../docs/images',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        security: resolve(import.meta.dirname, 'security.html'),
        bugs: resolve(import.meta.dirname, 'report-a-bug.html'),
        download: resolve(import.meta.dirname, 'download.html'),
      },
    },
  },
  plugins: [
    {
      name: 'orb-support-routes',
      configureServer(server) {
        const mail = {
          getApiKey: async () => {
            if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
            if (process.platform !== 'darwin') return undefined;
            // A variable specifier keeps the config bundler from resolving @orb/keychain at build time: it is a
            // dev-server-only dependency, unbuilt in a clean site build (Vercel).
            const keychainModule = '@orb/keychain';
            const { KeychainStore } = await import(/* @vite-ignore */ keychainModule);
            return new KeychainStore('ai.orb.site').get('RESEND_API_KEY');
          },
        };
        const reports = createBugReportHandler(mail);
        // Dev links are signed with a throwaway secret; downloading needs GITHUB_RELEASE_TOKEN in the environment.
        const linkSecret = process.env.DOWNLOAD_LINK_SECRET ?? 'dev-only-download-link-secret';
        const requests = createDownloadRequestHandler({ ...mail, getLinkSecret: () => linkSecret });
        const files = createDownloadFileHandler({
          ...mail,
          getLinkSecret: () => linkSecret,
          getGithubToken: () => process.env.GITHUB_RELEASE_TOKEN,
        });
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0];
          if (path === '/api/bug-reports') {
            void reports(req, res);
            return;
          }
          if (path === '/api/download-requests') {
            void requests(req, res);
            return;
          }
          if (path === '/api/download') {
            void files(req, res);
            return;
          }
          if (path === '/security' || path === '/report-a-bug' || path === '/download') req.url = `${path}.html`;
          next();
        });
      },
    },
    {
      name: 'orb-license-notices',
      generateBundle() {
        for (const [fileName, source] of [
          ['LICENSE.txt', 'LICENSE'],
          ['NOTICE.txt', 'NOTICE'],
          ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
          ['licenses/theme-fonts.txt', 'apps/ui/src/theme/fonts/LICENSES.txt'],
          ['licenses/symplist.txt', 'apps/ui/public/licenses/symplist.txt'],
          ['licenses/posthog.txt', 'node_modules/posthog-js/LICENSE'],
          ['licenses/posthog-core.txt', 'node_modules/@posthog/core/LICENSE'],
          ['licenses/posthog-types.txt', 'node_modules/@posthog/types/LICENSE'],
          ['licenses/core-js.txt', 'node_modules/core-js/LICENSE'],
          ['licenses/dompurify.txt', 'node_modules/dompurify/LICENSE'],
          ['licenses/dompurify-mpl.txt', 'node_modules/dompurify/LICENSE-MPL'],
          ['licenses/fflate.txt', 'node_modules/posthog-js/node_modules/fflate/LICENSE'],
          ['licenses/preact.txt', 'node_modules/preact/LICENSE'],
          ['licenses/query-selector-shadow-dom.txt', 'node_modules/query-selector-shadow-dom/LICENSE'],
          ['licenses/web-vitals.txt', 'node_modules/web-vitals/LICENSE'],
        ])
          this.emitFile({
            type: 'asset',
            fileName: fileName!,
            source: readFileSync(resolve(root, source!), 'utf8'),
          });
      },
    },
  ],
});
