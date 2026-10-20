# Data and privacy

The orb desktop app stores research locally and includes no telemetry, analytics SDK, automatic crash upload or cloud sync.
There is no orb account or central orb server. orb is open source under the MIT license.

## Website cookies

The marketing site uses PostHog analytics cookies with your permission. Accept or decline in the cookie notice;
use **Cookie settings** in the footer to change your choice. PostHog starts only after acceptance and sends page-view
events to the configured PostHog host. Session replay, automatic click/form capture, person profiles and error
tracking are disabled. Page URLs omit query strings and anchors, and referrer details are removed. PostHog also
receives connection information, such as your IP address, when your browser contacts it. See
[PostHog's privacy policy](https://posthog.com/privacy) for how it handles that data.

The site remembers cookie choices and appearance preferences in browser local storage. Analytics uses first-party
cookies with a 180-day lifetime. Declining removes PostHog's analytics persistence. If browser storage is blocked,
your choice applies to the current page. Website analytics does not receive your desktop research, boards or chat.

## Download requests

To download orb from the website, you enter your email on orb.tejassuds.com/download. The website uses it to email
you a personal download link (sent from orb@email.tejassuds.com through Resend) and sends it to orb's maintainer
together with the button you used, your approximate country and the time. The maintainer is notified again when the
link is used. Your email is not added to a mailing list and is never sent to website analytics. Download links expire
after 7 days. You can build orb from source without giving an email.

## Voluntary bug reports

The website's **Report a bug** form collects your email and issue details so support can reply. Name, version,
system, model information and evidence are optional. Sending submits your report and chosen attachments through
Resend from `orb@email.tejassuds.com` to `tejas@winsen.ai`, with your email as Reply-To. Nothing is automatically
read from your Mac. Website analytics does not capture form inputs, uploads or report contents.

The website handles uploads in memory without saving them to its filesystem or a research database. Resend and
the recipient's email system retain the submitted email and attachments under their own policies. Common
credential patterns are removed from report text and UTF-8 log/text/JSON attachments. Binary evidence, including
images, PDFs and ZIPs, is attached as selected; review it for private information. Automatic redaction is not a
guarantee that a file contains no sensitive data. See [Resend's privacy policy](https://resend.com/legal/privacy-policy).

Uploads are limited to five files and 10 MB combined. Request and email rate limits protect the endpoint. IP-based
rate-limit counters are kept temporarily in server memory. Failed sends retain the current browser form and files
for retry; the site does not save a bug-report draft in browser storage.

## What stays on your Mac

Boards, attachments, datasets, cached sources, conversations and reports live in the app's local directories.
Diagnostic logs are local and may contain research context, paths or error information even when credentials are
redacted. These files are not encrypted by orb. Your operating-system account, disk protection and backup policy
matter. See [local file locations](GETTING_STARTED.md#local-files).

Provider API keys, ChatGPT registrations/tokens and related credentials are stored in macOS Keychain. Sign out or
remove connections in Settings when you want to clear them. Do not export Keychain items with bug reports.

## What leaves your Mac

- Model requests send prompts, selected research context, tool results and supported attachments to your chosen provider.
- Search, Parallel operations and source reading contact the selected service or requested website.
- With no search API key configured, Scout's searches go to Bing (DuckDuckGo as a fallback) through a private,
  sandboxed browser window with no saved cookies. Configure a search API in Settings to use that service instead.
- ChatGPT sign-in opens OpenAI's authorization flow and inference uses the authorized plan route.
- Connected-site sessions remain local; authenticated reads contact that site when requested.

Those providers and sites have their own retention, usage and privacy policies. “Local-first” describes where orb
keeps the workspace and runs its orchestration; model inference can use remote services.

## Sharing and deletion

Review research documents, exported boards, logs and screenshots before sharing them. Exports can contain detailed
sources and attachments. To remove a workspace, close orb and remove the relevant local research/app-state files
and backups. Remove provider connections separately in Settings. Deleting a local file does not delete data already
sent to a provider or copied to a backup.

## Repository and screenshots

Development homes, generated installers and logs are ignored by Git. Public screenshots use an isolated synthetic
fixture with no private boards or account credentials. A release source check scans tracked content for known
credential patterns and disallowed runtime files; it is a useful guard, not a guarantee that any arbitrary research
file is safe to publish.
