# Models, subscriptions and costs

## Bring your own key

Use **Settings → Models** to add a built-in provider or a compatible custom endpoint. Configure its base URL,
protocol, API key and model identifiers as required, then test it. Provider API billing is separate from consumer
chat subscriptions. Keys are stored in Keychain and requests go directly through the configured provider route.
A compatible endpoint must support the tool calling and conversation behavior needed by orb's research agents.

The model directory can refresh provider models. An account may expose fewer models than a public catalog.
A model appearing in a picker does not establish that it supports every tool, image or reasoning option.
For Vertex AI MaaS, configure a compatible endpoint only when its authentication and request protocol are supported;
there is no claim of a complete native Google Cloud project/ADC integration in this release.

## Use a ChatGPT subscription

Select **Continue with ChatGPT** in Settings, complete browser authorization, and test an actual response. Eligible
Plus/Pro accounts can authorize plan-funded inference in the local open-source app without supplying an API key.
Select account-returned models for individual agents or use **Use for all agents**. Existing BYOK selections remain
until you change them. See [the full setup and recovery guide](CHATGPT_PLAN.md).

All agents share the account's applicable allowance. Plan/credit rules, workspace policy and model availability
are controlled by OpenAI. orb separates plan token usage from API dollar estimates and never silently falls back
to an API key. The sign-in does not import ChatGPT conversations. This is a local-app integration; a paid or
remotely hosted distribution requires separate review with OpenAI. Provider terms can change.

Official references, checked 2026-10-19: [quickstart](https://developers.openai.com/siwc/quickstart),
[open-source plan flow](https://developers.openai.com/siwc/token-sharing-open-source),
[preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Choose by role

| Agent | Main work | Sensible starting point |
| --- | --- | --- |
| orb | Scope, coordinate, reconcile and decide when the board is complete | A strong reasoning model with reliable tools and a large context window |
| Scout | Search, read and extract attributable evidence | A fast, tool-capable model; use stronger reasoning for difficult source reconciliation |
| Critic | Challenge assumptions, find contradictions and test completeness | A strong reasoning model, ideally with an independent perspective |
| Builder | Structure synthesis, diagrams, tables and deliverables | A capable instruction-following model; use the strongest route for complex synthesis |

Start with one reliable model for all agents, establish a good baseline, then optimize Scout's cost/latency.
Provider model names and capability tiers change; test on your actual workflow rather than treating a tier name
as a guarantee. Concurrent agents can improve elapsed time but also increase simultaneous requests, token usage
and pressure on rate limits. Parallelism does not multiply a subscription allowance.

## Search and Parallel

Desktop Chromium can search and read JavaScript-rendered public pages without a separate search API key. Site
restrictions can still block access. Optional API search providers and Parallel require their own credentials.
Parallel supports search/extraction, research tasks, entity discovery/enrichment and monitors; some operations are
paid and use visible approval controls. Search services and model inference are billed independently.
See [browser research](BROWSER_RESEARCH.md) and the implementation's cost/approval controls before using paid jobs.
