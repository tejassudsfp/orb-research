# Browser research

Scout can research public websites through orb's built-in Chromium browser. No Chrome installation, browser
extension or search API key is needed. In Settings → Models → Search, orb shows the configured search API or the
browser fallback. Parallel, Brave, Tavily and OpenAI search retain their existing precedence when configured.
Ask Scout to use browser search explicitly when preferred or after an API search fails.

Browser search opens Bing, with DuckDuckGo as a bounded fallback. Results are discovery material: Scout must read
the chosen pages before placing source/quote cards or relying on their claims. A rendered read waits briefly for
JavaScript content, then extracts readable Markdown into the canvas's existing source cache. Cards retain their
URLs and provenance; Critic, document composition and exports reuse the saved text without another browser visit.

For agent tooling, `web_search({query, browser:true})` chooses browser search; with no configured search API the
desktop app selects it automatically. `fetch_url({url, browser:true})` reads the rendered DOM. Ordinary HTTP/PDF
reads remain available, and very thin HTML shells automatically try rendering when the browser is available.
Cached rendered text remains readable offline. `refresh:true` fetches current content again.

Each operation uses a hidden sandboxed Chromium window with no preload, Node access or persistent signed-in
session. The existing public-address policy checks navigation and subresources. The authenticated loopback bridge
accepts structured queries and URLs, never agent-supplied scripts or selectors. Page text is untrusted evidence.
Browser reads share the screenshot/connected-site queue, honor Stop/Pause cancellation and destroy their windows
and temporary storage afterward. Captchas, verification blocks, unfinished pages and HTTP errors are explicit
failures; they are not saved as evidence. Search-engine verification blocks have a short backoff.

The existing connected-sites feature remains the route for a page requiring the user's approved sign-in.
Browser source retrieval does not supply inference: each agent still uses its configured ChatGPT plan or model
provider. Optional search APIs and Parallel tools keep their own billing.

Validation for P6.36 (2026-10-19): real Chromium fixture search → delayed JavaScript article → saved source card →
cached document citation → PDF with a source URL, without model calls on export. Negative checks cover executable
URLs, private targets/subrequests, browser-origin calls to the bridge, CAPTCHA, HTTP 503 and cancellation. A live
Bing search and rendered World Bank source read also passed without inference or search API credentials. A full
subscriber-funded research run on the user's MacBook remains human acceptance.
