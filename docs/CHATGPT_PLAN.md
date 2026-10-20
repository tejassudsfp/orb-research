# Use a ChatGPT plan in orb

In **Settings → Models → ChatGPT plan**, choose **Continue with ChatGPT**. Complete sign-in and permission approval
in your system browser, then return to Orb. No password, authorization code or token needs to be copied into Orb.

Choose an account-specific model and run **Test plan connection**. A completed response verifies inference;
sign-in and a model list alone do not. Choose **Use for all agents**, or select ChatGPT plan models individually
in the per-agent pickers. Existing API-key selections are not changed by sign-in. Model selections apply at the
next agent step, including existing and reopened boards. Context summaries use the same selected route; no
restart or new board is needed after changing providers.

**Manage usage** opens <https://chatgpt.com/settings/usage>. All Orb agents share the account's existing allowance;
this is not a separate allowance for each agent. ChatGPT controls app limits and optional credit overflow. Orb does
not invent remaining percentages or reset times, and never falls back to an API key when a plan request fails.
Plan token counts are shown separately from API dollar estimates. Other providers and API search services have separate billing.
Without a search API key, Scout can use the desktop Chromium browser for search and JavaScript-rendered public
pages. Those reads need no additional search API subscription. The selected model's inference still uses its
configured billing route. CAPTCHA, site blocking and login requirements remain explicit evidence limits.

If a plan limit is reached, Orb preserves the board and stops further plan requests. Review **Manage usage**, then
explicitly retry with **Test plan connection** or **Refresh models** when ready. Refreshing models permits a retry;
it does not replenish the plan allowance. If permission is absent, use **Enable ChatGPT plan usage**. If a renewable
session is no longer valid, sign in again with its saved connection. **Sign out** clears that connection's local
tokens and attempts remote revocation; Orb reports if remote revocation could not be confirmed.

Accounts and workspace registrations are kept separately, including registrations sharing an email. **Add account
or workspace** creates another registration. Switching accounts cancels old account requests and refreshes the model
directory. Credentials, the installation identifier, registrations and cached plan models are stored in the macOS
Keychain, never in `orb.json`, the profile patch or browser storage.

This integration follows OpenAI's documented flow for eligible Plus/Pro accounts in open-source and locally
hosted apps. Account/workspace policy and provider availability still determine access. OpenAI directs paid or
remotely hosted apps to its separate interest process; this release makes no claim of approval for that distribution.

Implementation references (checked 2026-10-19):

- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
- [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)

Protocol/security fixtures exercise OAuth, Keychain persistence, model selection, full-history Responses/tool
requests, quota blocking and desktop controls without a subscriber credential. Real plan eligibility, consent and
the first live plan-funded response require the account owner's browser sign-in and remain human acceptance steps.
