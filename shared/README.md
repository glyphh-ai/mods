# The shared account module

The one source of every mod's Glyphh account: one sign-in shared by every
Glyphh mod on the machine, and the plan's licence that sets what each mod may
do. Everything is a subscription; there is no trial and no one-off purchase.

`shared/licence/` is the source. Each plugin carries a copy in
`hooks/licence/` (a plugin loads on its own, so it cannot reach outside its
folder). Never edit a plugin's copy; edit `shared/licence/` and run
`node scripts/sync-shared.mjs`. `node scripts/check-shared.mjs` fails when a
copy differs from this source.

| File | What it does |
| --- | --- |
| `server.ts` | `SERVER` and `PUBLIC_KEY` (dev values; the build swaps in the live ones from `release.json`), the shared files' names and the timings |
| `canonical.ts` | Reads the licence keeping each number as written, and rebuilds Python's `json.dumps(sort_keys=True, separators=(",", ":"))` bytes, which the server signs |
| `verify.ts` | Checks the licence offline with Ed25519 (`vendor/ed25519.ts`, `@noble/ed25519`, vendored with its licence). Takes keys and signatures in base64 or base64url |
| `access.ts` | Pure: signed out, in the plan (with its limits), not in the plan, or expired; each limit's refusal line and the plan that lifts it; what the page is told |
| `flow.ts` | The life: sign-in by device flow, the licence fetched, kept and refreshed, sign-out, Upgrade and Manage billing |
| `hooks.tsx` | The one file with `$`: `/<mod> signin` and `/<mod> signout`, and the page's account line |

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
   **Manage billing** is `POST /v1/billing/portal`. **Sign out** is
   `POST /v1/sign-out`, then both files go.

## Where pages open

The sign-in page, Stripe Checkout and the billing page open in Claude's
Browser pane on the desktop app (`Claude_Browser` `preview_start`, the way
Workspaces opens its layout page); when the app refuses the mod's call,
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
