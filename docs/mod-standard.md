# The Glyphh mod standard

Every Glyphh mod follows this standard, so a new mod lines up with Workspaces
and Drips from its first commit. When this standard and a mod disagree, the
mod is wrong.

A mod is a Claude Code plugin with a hooks module. It changes Claude's own
interface or behaviour: a pane, a band above the prompt, a command, a hook on
tool calls or prompts. The module runs in the engine's sandbox, with no DOM
and no Node, and `$` reaches everything outside it. The API is the engine's
`.claude-plugin/types/claude-code/index.d.ts`. Grep it, and never guess an
API.

## Folder layout

```
plugins/<mod>/
  .claude-plugin/plugin.json   the manifest
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           register(on, options): wires the parts below
  hooks/<mod>/                 the mod's own code: small files, one job each
  hooks/licence/               the shared licence module (a copy, never edited here)
  hooks/licence/config.ts      the mod's licence values: the one file here that is its own
  helper/                      the local page and its server, when the mod has rich UI
  native/                      native source built on the buyer's machine, when needed
  types/index.d.ts             the $.state contract
  tests/                       *.test.ts, plus the fakes they share
  README.md                    for buyers first, then the developer footer
  tsconfig.json                extends ./.claude-plugin/types/tsconfig.json
```

- Pure logic (models, geometry, parsing, gates) lives in modules with no `$`.
  They are tested directly, and a helper that needs the same logic imports
  the same file (`*.mjs` with a `*.d.mts` beside it).
- `$` is used only in the file whose hook received it. Atoms are declared in
  the file that reads and updates them, with the plugin and key written as
  literals.
- Plugins never import from outside their own folder. They must load on
  their own.

## The manifest

```json
{
  "name": "<mod>",
  "version": "1.0.0",
  "description": "<Product>: what it does, in one sentence a buyer reads in /plugin",
  "author": { "name": "Glyphh AI", "url": "https://glyphh.ai" },
  "types": "./types/index.d.ts",
  "userConfig": { }
}
```

- `name` is lowercase, one word where possible. It is also the mod's slash
  command, its `MOD`, and its store and state namespace.
- `version` is semver. Bump it in the same change that is released. The build
  never bumps it.
- Settings are `userConfig` fields, and Claude's own `/config` draws them.
  A choice is a `string` field with `options`, which `/config` shows as a
  picker. Give every field a `title`, a `description` and a `default`. Read
  the fields through `register(on, options)` and make them whole in one
  function (a value outside its options takes the default). A change reloads
  the module. **A mod never has a settings screen of its own.**

## Licensing

Every mod sells the same way, through the shared module
(`shared/licence/`, copied in by `node scripts/sync-shared.mjs`):

1. **Trial.** The trial starts on the first run and lasts `TRIAL_DAYS` (7).
   The start is kept in the mod's store.
2. **Purchase.** The price is $5, paid once. Unlock opens the mod's Stripe
   Payment Link with `?client_reference_id=<install id>`. The install id is
   made once and kept in the store. The mod then polls
   `https://glyphh.ai/api/license?mod=<mod>&install=<id>` every 3 seconds for
   up to 10 minutes, until the site answers a licence.
3. **The licence.** A licence is `base64url(payload).base64url(signature)`,
   signed by the site with Ed25519. It is checked offline with the public key
   in `site.ts`, using the vendored `@noble/ed25519`. The payload names the
   mod, so a licence for one mod never unlocks another.
4. **Another machine.** `/<mod> key <licence>` takes a licence pasted in.
   Copy licence key, in the mod's page, gives it to the buyer.
5. **After the trial**, gated commands answer `refusal()`, and the mod's page
   shows the locked screen: what the mod does (`ABOUT`) and Unlock.

The mod's own values live only in `hooks/licence/config.ts`: `MOD`, `PRODUCT`,
`PRICE`, `ABOUT`, `PAYMENT_LINK` (the test link in source) and `TRIAL_DAYS`.
Every other file in `hooks/licence/` is a copy. Edit `shared/licence/` and
sync. CI fails on a copy that differs. A release swaps in the live `SITE`,
`PUBLIC_KEY` and `PAYMENT_LINK` from `release.json`.

The page shows the licence in words that the mod sends it: the days left and
Unlock, the wait for checkout, or the locked screen. The licence itself never
goes to the page.

## UI

- **Use Claude's own elements first.** These are panes and bands drawn from
  `$.ui.resolve(e)`, toasts, status entries and commands. They follow
  Claude's theme by themselves.
- **For rich UI, use a local page in Claude's Browser pane.** Use one when
  the UI needs live web pages, canvas animation, or drag and drop beyond the
  pane elements:
  - A helper (Node) serves the page on `127.0.0.1` only, on a port the mod
    picks.
  - Every request must carry a per-session token (`?t=` or `X-Token`),
    compared in constant time.
  - `Host` must be `127.0.0.1:<port>`, and any `Origin` the page's own. That
    refuses DNS rebinding and other sites.
  - The page is opened with a **one-time key** URL (`/?k=…`). The key works
    once, within 10 minutes. The page then carries the token, and the address
    bar is cleaned. Prompts and the Browser pane get only one-time URLs.
  - Responses carry a CSP and `frame-ancestors 'none'`. The page loads
    nothing from outside.
  - The page is opened in Claude's Browser pane (`Claude_Browser.preview_start`).
- **Look like Claude.** Every colour is a token on `:root`, and no rule names
  a colour itself. These are the dark values, sampled from Claude's Browser
  pane:

  | Token | Value | Use |
  | --- | --- | --- |
  | `--c-outer` | `#151515` | window, behind the panes |
  | `--c-bg` | `#191918` | pane and page |
  | `--c-field` | `#252424` | raised fields, inputs |
  | `--c-line` | `#30302f` | borders |
  | `--c-line-2` | `#3b3a3a` | stronger borders |
  | `--c-text` | `#edede9` | text |
  | `--c-text-2` | `#bbbaaf` | secondary text |
  | `--c-btn` / `--c-btn-text` | `#fafafa` / `#191918` | primary button |
  | `--c-btn-2` | `#4a4a49` | secondary button |
  | `--c-accent` | `#d97757` | Claude's orange: focus, selection, drop targets, sparingly |
  | `--c-danger` | `#e5675c` | destructive actions |

  The font is the system font:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  13px. The light set (under `prefers-color-scheme: light`) is
  **provisional** until it is sampled from Claude's light pane. Icons are
  16px, with 1.5px strokes and round ends, in `currentColor`.
- Copy the layout of an existing Glyphh design when one exists (the Glyphh
  app's screens). Don't invent new chrome.

## The helper process

- The mod starts the helper detached, so it **survives a hot reload** of the
  mod. A reloaded mod finds it again (the port, token and version are kept in
  `$.state`) and reattaches instead of starting another.
- The helper's version is a hash of its files. A changed helper is replaced,
  never left running stale.
- **It exits when the session stops asking.** The mod polls it, and after 30
  seconds without a poll, it shuts down. A helper that runs a browser also
  exits when that browser closes.
- **No secrets in logs or files.** The token is passed in the environment and
  never written down or printed. The one-time keys are not logged either.
- It reads and writes only the mod's own files (`~/.glyphh/…`, its cache
  folder), and writes them atomically.

## Testing

- Every behaviour has a test, and production code has no stubs or demo
  shortcuts. Aim for full coverage of `hooks/` and of every pure helper
  module.
- Unit tests cover pure modules directly. Engine tests drive the mod through
  `claude-code/testing`:
  - `mock.store` and `mock.clock` stand in for storage and time.
  - World fakes answer `$.fs`, `$.process` and the helper's HTTP.
  - Settings tests use `test(name, { options }, body)`.
- With the clock, seed the state rather than advancing time by days. Large
  advances with 1-second intervals exhaust the kit's waits.
- `claude plugin test` and `claude plugin validate` both pass clean, with
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
- Licence tests (access, flow, verify) stay in each plugin, naming that
  mod's values.

## Naming and writing

- The mod's name is a lowercase word (`workspaces`, `drips`). `PRODUCT` is
  how people read it (`Workspaces`, `Drips`).
- Commands are `/<mod>` for the mod's own page and licence, plus short verbs
  of its own (`/dip`, `/drip`).
- Write user-facing words in plain British English, short and concrete. Say
  what something does, not how it works.
- Use clear commit messages, one step per commit. Commits made with Claude
  end with its `Co-Authored-By` line.

## Versioning and releases

1. Bump the plugin's `version` in the change being released.
2. Keep live values in `release.json`. A release refuses `TBD` or test values.
3. Tag `v*`. `release.yml` checks, tests, validates and builds every mod. It
   publishes to glyphh-ai/glyphh only when `PUBLISH_ENABLED` is `true`.

See the root README for the details.

## A mod must never

- Write `~/.claude/settings.json` or change Claude's global settings. Use
  session-scoped commands (`/model`, `/effort` through `$.command.run`), and
  use `userConfig` for the mod's own settings.
- Read, copy or send Claude's login, tokens or account data anywhere.
- Call home after licensing. Once a licence checks out offline, the mod
  makes no request to Glyphh. Before that, the only requests are the
  checkout poll while the buyer is buying.
- Send buyer data anywhere. Pages, files and settings stay on the machine.
- Open native apps, links or URLs the buyer didn't ask for.
- Ship tests, debug pages or developer tooling.
