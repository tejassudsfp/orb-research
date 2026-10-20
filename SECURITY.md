# Security

Please report a suspected vulnerability privately. Use [GitHub private vulnerability reporting](https://github.com/tejassudsfp/orb-research/security/advisories/new)
when available, or email [tejas@winsen.ai](mailto:tejas@winsen.ai) for a private report.
Do not put passwords, OAuth tokens, API keys, private URLs or board contents in a public issue.

Include the affected version/commit, a minimal reproduction using invented data, impact and any proposed fix.
There is no guaranteed response-time SLA. The current development version is the supported target for fixes.

## Security boundaries

orb uses a sandboxed Electron renderer, an authenticated loopback sidecar and scoped native bridges.
Agent tools are restricted to research and board operations. Keys and ChatGPT credentials live in macOS Keychain.
Boards, attachments, source caches, sessions and diagnostic logs are local files; they are **not application-level
encrypted**. Protect your macOS account, backups and disk accordingly.

Research sends relevant content to the models and services you choose. Web pages are untrusted input, and agents
can make mistakes. Review outputs and sensitive attachments before sharing. See [privacy](docs/PRIVACY.md).

Current builds target macOS 14+ on Apple silicon. Official installers are published only on
[GitHub Releases](https://github.com/tejassudsfp/orb-research/releases), signed with the Developer ID of Fanpit Technologies
Private Limited (Team ID Q78J7L8TLR) and notarised by Apple. Verify the SHA-256 checksum published with each release.
See [release procedures](docs/RELEASING.md).

The marketing site's `/security` page explains these boundaries. `/report-a-bug` sends only explicitly submitted
reports and selected evidence through a server-side Resend endpoint. Its sending key never enters the browser;
local development stores it in a separate macOS Keychain service. Reports are emailed to a fixed support address,
with bounded uploads, same-origin checks, per-instance rate limits and retry idempotency. These controls do not
replace deployment-level abuse protection, particularly when running more than one server instance.
