# orb marketing site

A responsive product site using orb's own brand assets and shared six-style engine, with a server-side bug-report endpoint.

```sh
pnpm site:dev
pnpm site:build
pnpm site:start
```

The Vite output in `apps/site/dist` is HTML/CSS/JS with relative asset paths. `apps/site/dist-server/start.js` is the
Node server for the same-origin support endpoint and pretty page routes. Source screenshots
are shared from `docs/images`, fonts from the app, and theme tokens from `@orb/shared`. No provider credentials,
external font requests or hosted research database are used. Preview locally before choosing a public domain.
See [release procedures](../../docs/RELEASING.md) for distribution checks.

## Website analytics

Set the public `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` in an ignored
`apps/site/.env.local` file or the build environment. Vite supports these names; no Next.js runtime is required.
Restart the dev server after changing them. Without both values the SDK never loads. The public project token
is intended for browser use; never use a personal PostHog API key.

The website offers Accept/Decline controls and footer Cookie settings. After acceptance, it sends page views and
uses first-party cookies. No session replay, automatic interaction capture, person profiles, flags or error
tracking are enabled. Tests intercept PostHog traffic instead of sending events to the real project. Analytics
is a site-only dependency and is excluded from the desktop distribution.

## Support and security

`/report-a-bug` requires submitter email, issue title and description; optional fields and up to five evidence
files / 3 MB provide context. `/security` explains local storage, Keychain, provider requests and voluntary uploads.
The server emails reports and attachments through Resend from `orb@email.tejassuds.com` to `tejas@winsen.ai`.
The submitter's email is Reply-To. The sender domain must be verified in Resend before delivery will work.

For local macOS development, run `pnpm site:resend-key` and enter a Resend sending key at the hidden prompt.
It is stored in Keychain service `ai.orb.site`, account `RESEND_API_KEY`. Vite reads it only on the server.
Run the same command with a replacement key to rotate it. No key belongs in a `VITE_` or `NEXT_PUBLIC_` variable.

**Vercel (production, orb.tejassuds.com).** Import the repository with Root Directory `apps/site`. `vercel.json`
installs the workspace and runs `build:vercel`, which writes Vercel's Build Output API: static pages, the routes
(`/security`, `/report-a-bug`) and a Node function for `/api/bug-reports` (`server/vercel-bug-reports.ts`, which uses
Vercel's `x-real-ip` for rate limits). Set `SITE_ORIGIN`, `RESEND_API_KEY`, `DOWNLOAD_LINK_SECRET`,
`GITHUB_RELEASE_TOKEN`, the two public PostHog variables and `ENABLE_EXPERIMENTAL_COREPACK=1` in the project settings. See [releasing](../../docs/RELEASING.md#6-deploy-the-website).

**Downloads by email.** Download buttons carry `data-download` and open `/download?from=<placement>`
(`src/download.ts`). The form (`download.html`, `src/download-page.ts`) posts to `/api/download-requests`
(`server/download-requests.ts`), which emails the visitor a link signed with `DOWNLOAD_LINK_SECRET`
(`server/download-links.ts`, valid 7 days) and notifies `projects.tejassuds@gmail.com`. `/api/download`
(`server/download-file.ts`) verifies the link, notifies `projects.tejassuds@gmail.com` of the download, and redirects to a
short-lived GitHub URL for the DMG in the private `tejassudsfp/orb-releases` release (`GITHUB_RELEASE_TOKEN`). Both
endpoints share `server/http.ts` with the bug-report endpoint. With cookies accepted, PostHog records
`download_clicked` and `download_requested` (never the email).

**Any Node host.** Build the site, then run `node apps/site/dist-server/start.js` on Node 22.19+ with server-only
`RESEND_API_KEY`, `SITE_ORIGIN` (the exact HTTPS origin) and the host's `PORT` setting. The bundled server uses only
Node built-ins at runtime. Keep the secret in the host's secret settings; it is never bundled into client files.
A static host alone cannot send reports: it must route `/api/bug-reports` to this backend and map `/security` and
`/report-a-bug` to their HTML pages. The included Node server handles all of these routes.

Evidence is bounded, processed in memory and attached to the support email; no server upload directory or report
database is created. Text reports/logs receive common credential redaction. Binary files remain as selected.
Endpoint controls include same-origin checks, fixed mail addresses, per-instance IP/global rate limits and
Resend idempotency keys. On multi-instance hosting, also enforce shared rate limits at the ingress layer.
Automated tests use an isolated fake transport and never send user files or real test emails.
