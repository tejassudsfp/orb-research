# Getting started

## Prerequisites

- An Apple silicon Mac running macOS 14 or later.
- Node.js 22.19 or later and pnpm 10.34.7. CI currently uses Node.js 26.8.1.
- Internet access for dependencies and any model/source services you choose.

```sh
git clone https://github.com/tejassudsfp/orb-research.git
cd orb-research
corepack enable
corepack prepare pnpm@10.34.7 --activate
pnpm install --frozen-lockfile
pnpm dev
```

If your Node distribution omits Corepack, install pnpm 10.34.7 using its official installation instructions.
`pnpm dev` builds the workspace and opens Electron. No `.env` file or hosted backend is required. A model
connection is required for agent work; browsing and organizing a board can be done without one.

## Connect a model

Open **Settings → Models**. Add a provider API key or choose **Continue with ChatGPT**. Test the connection and
select a model for each agent. Credentials are stored in macOS Keychain. Follow [models](MODELS.md) and
[ChatGPT setup](CHATGPT_PLAN.md) for billing and eligibility details. Never paste credentials into research chat.

## Your first board

Start with a bounded question, for example: “Help me compare three venues for a community repair café. Separate
assumptions from facts and tell me what I still need to verify.” Choose a suitable template or begin with a blank
canvas. Add your own sources, review what agents place, and clarify through the right-hand chat or a card's thread.
Open a card for its detailed view; the card preview is only an overview. Use the output composer to prepare and
review a document or presentation.

## Local files

| Mode | Research | Internal app state |
| --- | --- | --- |
| Development | `<checkout>/.orb-dev/Orb` | `<checkout>/.orb-dev/dsh`, logs and Electron test/development state |
| Packaged app | `~/orb` | `~/Library/Application Support/orb` including the private harness home |

Case-insensitive macOS volumes may display an older `Orb` folder with the same contents. Use Finder's Go to Folder
when locating it. Each canvas has an append-only `board.jsonl`, metadata, attachments and associated dataset/source
files. Preserve the whole research directory and app state for a full backup, with orb closed. Credentials remain
in Keychain and require separate sign-in after moving to a new Mac. Treat logs and sessions as private data.

## Troubleshooting

- **No research starts:** test the selected model, check its usage/credits and review the visible connection error.
- **ChatGPT limit:** open Manage usage, review the account/app allowance and explicitly retry when available.
- **No browser result:** CAPTCHA, blocked pages and login requirements can prevent a read. Supply an accessible source.
- **App launch/native dependency errors:** use the pinned Electron binary; do not independently upgrade it. Reinstall
  with `pnpm install --frozen-lockfile` and run `node node_modules/electron/install.js` if the binary download is missing.
- **Diagnostics:** installed macOS builds write `sidecar.log` under `~/Library/Logs/orb/`. In the website's Report a bug form, choose files, press Shift–Command–G in the file picker, enter that folder and select `sidecar.log`. You can also drag the file or screenshots from Finder into the upload area. Review prompts, paths and account information before attaching; evidence is optional.

## Build an installer

```sh
pnpm dist:adhoc
```

The DMG appears under `release/dist/`. A local `dist:adhoc` build is ad-hoc signed and not notarised, so it is for
your own Mac only. Signed, notarised installers come from [GitHub Releases](https://github.com/tejassudsfp/orb-research/releases);
maintainers build them with `pnpm release:mac` ([release procedures](RELEASING.md)). Do not disable macOS security protections globally.
