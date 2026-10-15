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
  hooks/licence/               the shared account module (a copy, never edited here)
  hooks/licence/config.ts      the mod's own values: the one file here that is its own
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

## Accounts and plans

Every mod is part of one subscription. There is no trial, no one-off price
and no licence key. A person signs in to Glyphh once, with a free account,
and their plan sets what each mod may do. The shared module
(`shared/licence/`, copied in by `node scripts/sync-shared.mjs`) does all of
it; `shared/README.md` has the flow in full.

1. **One sign-in per machine.** `/<mod> signin` (or **Sign in to Glyphh** in
   the mod's page) runs the Glyphh server's device flow: a code shown, the
   server's page opened in the browser, the token polled for. The token is
   kept in `~/.glyphh/install.json` (mode 0600, written atomically, never
   logged or sent to a page) and every Glyphh mod on the machine shares it.
   `/<mod> signout` signs the machine out for all of them. Each mod reads the
   shared files again every few seconds.
2. **The plan's licence.** `GET /v1/license` answers the plan, signed with
   Ed25519 over Python's canonical JSON. The mod checks it offline with the
   public key in `server.ts`, keeps it in `~/.glyphh/license.json`, and
   refreshes it at each session start and at half its life. A licence for
   another install, or with a bad signature, is never used. Offline, a valid
   licence keeps working until it expires; then the mod asks to sign in
   again (on the Free plan, Free's limits keep holding).
3. **Limits.** `payload.mods["<mod>"].limits` names each limit: a number, or
   null for unlimited. A name it leaves out is 0; a mod not in `mods` is not
   in the plan. A mod enforces only its own limit names, declared in
   `LIMITS` in its `config.ts` as a count (`workspaces`, `custom_drips`) or a
   switch, 0 or 1 (`stream`, `fullscreen`). Workspaces has `workspaces`,
   `favorites` and `stream`; Drips has `custom_drips` and `fullscreen`.
4. **Refusals.** Signed out, a mod's gated commands answer `gate()`: sign in.
   Not in the plan, or past a limit, they answer `refusal()`: a short line
   naming the limit and the plan that lifts it, with **Upgrade**. What a
   person already has keeps working; a limit refuses the next one.
5. **Upgrade and billing.** Upgrade opens the server's Stripe checkout for
   the plan that lifts the limit and waits for the licence's plan to change;
   Manage billing opens Stripe's billing page. The org's admin makes these
   changes; the mod says so to anyone else.
6. **Add-ons.** The plans (Free, Pro, Team) include Workspaces alone; every
   other mod (Drips, Programs, Gateway, Ada) is an add-on on the org's one
   Stripe subscription, allowed on the paid plans (`GET /v1/addons`). A mod
   sold as one and not in `mods` is closed with its offer, "Drips is an
   add-on ($2/month per seat on Pro). Add it in /drips.", and **Add it**
   (`addOn()`, `/<mod> add`). Not subscribed, Add it opens Checkout for the
   cheapest plan that allows it with the add-on, at the org's seats, and
   waits for the mod to be in the licence. Subscribed, it shows the
   prorated price now and the month (`POST /v1/billing/addons/preview`)
   with **Confirm** (`/<mod> add confirm`), which adds it at that price
   (`POST /v1/billing/addons` with the preview's `proration_date`) and
   refreshes the licence.

The mod's own values live only in `hooks/licence/config.ts`: `MOD`,
`PRODUCT`, `ABOUT` and `LIMITS`. Every other file in `hooks/licence/` is a
copy. Edit `shared/licence/` and sync. CI fails on a copy that differs. A
release swaps in the live `SERVER` and `PUBLIC_KEY` from `release.json`.

The page shows the account in words that the mod sends it (`pageStatus`):
signed out with **Sign in to Glyphh** (and the code while signing in), the
plan with **Upgrade** and **Manage billing** in its top bar, or the locked
screen (what the mod does, and why it is closed: an add-on's offer with
**Add it**, or its price with **Confirm**). It also gets each limit
and its refusal line, so a save past a limit is refused inline with
**Upgrade**. The token never goes to the page.

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
- Account tests (canonical, verify, access, flow) stay in each plugin,
  naming that mod's values. Licence fixtures are the server's answers,
  written by Python's `json.dumps` and signed with the dev key; the canonical
  JSON is checked byte for byte against Python's.

## Naming and writing

- The mod's name is a lowercase word (`workspaces`, `drips`). `PRODUCT` is
  how people read it (`Workspaces`, `Drips`).
- Commands are `/<mod>` for the mod's own page, `/<mod> signin` and
  `/<mod> signout` for the Glyphh account, plus short verbs of its own
  (`/dip`, `/drip`).
- Write user-facing words in plain British English, short and concrete. Say
  what something does, not how it works.
- Use clear commit messages, one step per commit. Commits made with Claude
  end with its `Co-Authored-By` line.

## Versioning and releases

1. Bump the plugin's `version` in the change being released.
2. Keep live values in `release.json` (`SERVER`, `PUBLIC_KEY`). A release
   refuses `TBD` or a server that isn't https.
3. Tag `v*`. `release.yml` checks, tests, validates and builds every mod. It
   publishes to glyphh-ai/glyphh only when `PUBLISH_ENABLED` is `true`.

See the root README for the details.

## A mod must never

- Write `~/.claude/settings.json` or change Claude's global settings. Use
  session-scoped commands (`/model`, `/effort` through `$.command.run`), and
  use `userConfig` for the mod's own settings.
- Read, copy or send Claude's login, tokens or account data anywhere.
- Call Glyphh for anything but the account: the device flow, the licence
  (at session start and at half its life), the plans, checkout, billing and
  sign-out. A mod that runs rrotor (Programs, and later Gateway and Ada) also asks
  for its local runtime's token (`POST /v1/runtime/local`) and hands it to
  rrotor over rrotor's local API, never in a file, a log or a command line. The sign-in sends the machine's name, a SHA-256 of its hardware
  UUID and the mod's version, nothing else.
- Send a person's data anywhere. Pages, files and settings stay on the
  machine. The Glyphh token goes only to the Glyphh server, in its
  `Authorization` header.
- Open native apps, links or URLs the buyer didn't ask for.
- Ship tests, debug pages or developer tooling.
