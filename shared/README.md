# The shared modules

Three modules the mods' code comes from. A plugin uses a module when its copy
holds the plugin's own `config.ts`; that file is the only one not copied, and
its `MOD` (and `COMMAND`, when it has one) is written in for `__MOD__` and
`__COMMAND__` in the others (the engine reads atom references and command
matchers as literals). A plugin loads on its own, so it cannot reach outside
its folder: never edit a copy. Edit the source and run
`node scripts/sync-shared.mjs`; `node scripts/check-shared.mjs` fails when a
copy differs, and the release build refuses one.

| Module | Copied to | For a mod that | Uses |
| --- | --- | --- | --- |
| `shared/licence/` | `hooks/licence/` | needs a Glyphh account: the sign-in, the plan's licence and its limits | Ada |
| `shared/unlock/` | `hooks/unlock/` | is bought once, per machine: a Stripe Payment Link, then a licence the server signs for that install, checked offline, with no account | Drips, Games |
| `shared/overlay/` | `hooks/overlay/` | draws over Claude: the native overlay (`overlay.swift`, compiled once with swiftc and kept in `~/Library/Caches/glyphh-overlay`) effects and games play in | Drips, Games |

The `glyphh` mod is the account itself and uses none of these.

## Live values

`release.json` holds what a release swaps in for the dev values
(`scripts/build.mjs`), for the modules each plugin uses. The build refuses
`TBD`, a server that isn't https, and a Stripe test link; `--dry-run` keeps
the dev values and says which. The overlay has none.

| Key | Goes in |
| --- | --- |
| `SERVER` | `hooks/licence/server.ts` and `hooks/unlock/server.ts` `SERVER`: the Glyphh server; and, for the `glyphh` mod, `hooks/glyphh/api.ts` `DEFAULT_SERVER` and `.mcp.json`'s `GLYPHH_SERVER_URL` |
| `PUBLIC_KEY` | `hooks/licence/server.ts` and `hooks/unlock/server.ts` `PUBLIC_KEY`: the one key the server signs every licence with |
| `plugins.<plugin>.PAYMENT_LINK` | `hooks/unlock/config.ts` `PAYMENT_LINK`: the plugin's live Stripe Payment Link |

## Bought once (`shared/unlock/`)

`/<command> unlock` opens the mod's Stripe Payment Link with this install's
id (`client_reference_id`) and asks
`{SERVER}/v1/unlock/license?mod=<mod>&install=<id>` every few seconds until
it answers a licence: `base64url(JSON payload) "." base64url(Ed25519
signature)`, checked offline against `PUBLIC_KEY` and kept in the mod's
store, checked again at each session start. `/<command> key <licence>`
carries it to another machine. The plugin's `hooks/unlock/config.ts` holds
`MOD`, `COMMAND`, `PAYMENT_LINK`, `PRODUCT`, `PRICE` and `ABOUT`.

## The overlay (`shared/overlay/`)

| File | What it does |
| --- | --- |
| `overlay.swift` | The native overlay: one effect or game over Claude's window, or over the whole screen |
| `overlay.ts` | Its command protocol, pure |
| `host.ts` | Compiles it the first time it is needed, one binary per version of its source, and runs one overlay process per document |
| `target.ts` | Which window `claude-window` means: the Claude app's own, or the terminal hosting Claude Code |

The plugin's `hooks/overlay/config.ts` holds `MOD`.

## The Glyphh account (`shared/licence/`)

One sign-in shared by every Glyphh mod on the machine, and the plan's
licence that sets what each mod may do.

| File | What it does |
| --- | --- |
| `server.ts` | `SERVER` and `PUBLIC_KEY` (dev values; the build swaps in the live ones from `release.json`), the shared files' names and the timings |
| `canonical.ts` | Reads the licence keeping each number as written, and rebuilds Python's `json.dumps(sort_keys=True, separators=(",", ":"))` bytes, which the server signs |
| `verify.ts` | Checks the licence offline with Ed25519 (`vendor/ed25519.ts`, `@noble/ed25519`, vendored with its licence). Takes keys and signatures in base64 or base64url |
| `access.ts` | Pure: signed out, in the plan (with its limits), not in the plan, or expired; each limit's refusal line and the plan that lifts it; an add-on's offer and price; what the page is told |
| `flow.ts` | The life: sign-in by device flow, the licence fetched, kept and refreshed, sign-out, Upgrade, the add-on (checkout, or preview and Confirm) and Manage billing |
| `hooks.tsx` | The one file with `$`: `/<mod> signin`, `/<mod> signout` and `/<mod> add [confirm]`, and the page's account line |

- `__MOD__` in a file is written as the plugin's `MOD` (from its
  `hooks/licence/config.ts`) when it is copied: the engine reads atom
  references and command matchers as literals.
- Each plugin's own `hooks/licence/config.ts` is the only file not copied:
  `MOD`, `PRODUCT`, `ABOUT` and `LIMITS` (the limit names it enforces, each a
  count or a switch, with the words its refusal uses).

## The flow

1. **Sign in.** `POST {SERVER}/v1/device/code` with `machine_id` (SHA-256 hex
   of the Mac's `IOPlatformUUID`, never the UUID), `name` (the computer's
   name), `surface` (`desktop` or `cli`) and `mod_version`. The mod shows
   `user_code`, opens `verification_uri_complete`, and polls
   `POST /v1/device/token` at `interval` (5 seconds slower on `slow_down`)
   until `{ access_token, install_id }`, `expired_token`, `access_denied`
   or `expires_in` running out.
2. **The token** goes in `~/.glyphh/install.json`, `{ server, install_id,
   token }`, written mode 0600 and atomically (`umask 077`, a temporary name,
   then `mv`), the text on stdin, never in an argument or a log. A file for
   another server is not used.
3. **The licence.** `GET /v1/license` with the token answers `{ payload,
   signature }`. It is kept in `~/.glyphh/license.json` as
   `{"fetched_at": <ms>, "license": <the answer as it came>}`, so its
   signature checks out again when read. A licence for another install, or
   with a bad signature, is never used.
4. **Refresh** at each session start and at half the licence's life; a
   failed try waits a minute. A 401 signs the machine out. Offline, a valid
   licence keeps working until `expires_at`.
5. **Every Glyphh mod** reads the two files again every 5 seconds, so a
   sign-in or sign-out in one shows in the others.
6. **Upgrade** asks `/v1/plans` for the plan that lifts the limit (else the
   next plan with this mod), `POST /v1/billing/checkout` `{ plan, seats }`
   (seats raised to the org's when the server names them), opens Stripe's
   page and asks for the licence every 5 seconds for up to 15 minutes until
   the plan changes. An org already subscribed is sent to the billing page.
   Checkout's seats are the org's (`GET /v1/org`), raised when the server
   names more taken.
7. **Add-ons.** The plans include no mod; every mod is an add-on
   (`GET /v1/addons`: price, per seat or flat, the plans it is allowed on,
   whether the org has it), and the licence's `mods` is the org's add-ons. A mod sold as one and not in `mods`
   says "<Mod> is an add-on ($X/month per seat on <plan>). Add it in
   /<mod>." **Add it** (`/<mod> add`) asks
   `POST /v1/billing/addons/preview` `{ mod, action: "add" }`:
   - not subscribed (`not_subscribed`): `POST /v1/billing/checkout`
     `{ plan, seats, addons: [<mod>] }` for the cheapest plan that allows it,
     opened as above, and the licence asked until the mod is in it;
   - subscribed: the prorated amount now and the month are shown with
     **Confirm** (`/<mod> add confirm`), which sends `POST /v1/billing/addons`
     `{ mod, proration_date }` and refreshes the licence;
   - not the admin (403): "Only your Glyphh org's admin can add mods.";
     `not_on_plan` names the plan to change to; `already_added` asks for the
     licence again.
8. **Manage billing** is `POST /v1/billing/portal`. **Sign out** is
   `POST /v1/sign-out`, then both files go.

## Where pages open

The sign-in page, Stripe Checkout and the billing page open in Claude's
Browser pane on the desktop app (`Claude_Browser` `preview_start`); when the app refuses the mod's call,
Claude is asked, once the command has returned, to open the link there. The
Mac's own browser is never opened from the desktop app. In a terminal session
the link is printed and copied, and `open` is tried. No URL or prompt ever
carries the token: the device page's link carries the user code alone.

## What a plan allows

`payload.mods["<mod>"].limits` holds the mod's limits: a number, or `null`
for unlimited. A name it leaves out is 0, and a mod not in `mods` is not in
the plan. An expired licence closes the mod (sign in again), except on the
Free plan, whose limits keep holding. See `docs/mod-standard.md` for how a
mod uses it.
