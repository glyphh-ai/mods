# Drips

Drips plays visual effects over Claude: confetti, fireworks, hearts,
stars, bubbles, a matrix rain, an aurora and more. Play one with a
command, save your own recipes, and let Claude play them too.

```
/drip confetti
/drip 3 hearts stars
/drip -1 aurora
/drip stop
```

Drips works in Claude Code on a Mac.

## Requirements

- **Node.js 18 or newer** (https://nodejs.org). It runs the small local
  page that plays effects in Claude's window and holds the Drips editor.
- For **fullscreen** effects: the **Xcode Command Line Tools**, which bring
  Swift (`xcode-select --install`). Without them, Drips plays effects in
  Claude's window and tells you so.

## Install

In Claude Code, run:

```
/plugin marketplace add glyphh-ai/glyphh
/plugin install drips@glyphh
```

To let Drips open its page in the desktop app's Browser pane without
asking you each time, allow this call in `~/.claude/settings.json`:

```json
"permissions": {
  "allow": ["mcp__Claude_Browser__preview_start"]
}
```

If you don't, and the app refuses the call, Drips asks Claude to open the
page for you.

## Commands

| Command | What it does |
|---|---|
| `/drip <recipe>` | Plays a recipe, or one of your saved drips by name |
| `/drip list` | Lists the effects and your saved drips |
| `/drip save <name> <recipe>` | Saves a recipe under a name |
| `/drip delete <name>` | Deletes a saved drip |
| `/drip stop` | Stops every effect that keeps playing |
| `/drips` | Opens the Drips page: your saved drips, and an editor |
| `/drips signin` | Signs in to Glyphh |
| `/drips signout` | Signs this Mac out of Glyphh |

`/drip` runs straight away, even while Claude is working.

## Recipes

A recipe is a few words, in any order:

- **An effect**: `fireworks`, `hearts`, `confetti`, `stars`, `rain`,
  `bubbles`, `sparkle`, `spiral`, `emoji`, `wave`, `thumbsup`, `peace`,
  `cat`, and the backgrounds `matrix`, `aurora`, `nebula`, `plasma`,
  `fireflies`, `starfield`. Name several and they play one after another.
- **A number from 1 to 10**: how many times to play them. Each effect
  starts 1.5 seconds after the one before.
- **A number between 0 and 1**: how see-through the effect is (`0.4`).
- **`-1`**: keep playing. The effect stays until you play the same
  recipe again, run `/drip stop`, or press Esc in the Drips page. Nothing
  plays for longer than 30 minutes.
- **A saved drip's name**: its effects join in.

`/drip` alone plays fireworks.

## Where effects play

Open `/config` and find **Where effects play** under Drips:

- **claude-window** (the default) plays effects over Claude's window, in
  the Drips page in the desktop app's Browser pane. The first effect opens
  the page. Outside the desktop app, the page opens in your own browser.
- **fullscreen** plays effects over the whole screen under the pointer,
  above every app and on every Space. Effects never take the pointer or
  the keyboard: you can keep working through them. The first fullscreen
  effect takes a few seconds longer, while Drips builds its small overlay
  program with Swift. It's built once and kept in
  `~/Library/Caches/glyphh-drips`. Fullscreen needs a plan with the
  `fullscreen` limit on; without it, effects play in Claude's window and
  Drips says so once.

Previews from the Drips page always play in the page, and a preview that
keeps playing stops by itself after 12 seconds.

## The Drips page

`/drips` opens the page. **Your drips** lists each saved drip with its
recipe and a **Play** button. Search by name or recipe, or click **+ Add**
to make one. Click a drip to edit it:

- **Name**
- **Mode**: **One-shot**, **Counted** (2 to 10 times) or **Persistent
  (toggle on/off)**
- **Effects**: pick one or more; **+ Add effect** adds another
- **Recipe preview**: the recipe your choices make
- **▶ Play** and **■ Stop**, **Save**, **Cancel**, and **Delete** (it asks
  first)

Leaving the editor stops whatever it played.

## Claude can play them too

Claude has two tools: `play_drip` plays a recipe (or stops them), and
`list_drips` lists the effects and your saved drips. Ask Claude to
celebrate and it may.

## Just for fun

Two more rows in `/config`, both off until you turn them on:

- **Confetti after a long turn**: confetti when Claude finishes a turn
  that ran longer than two minutes.
- **Matrix while tools run**: a faint matrix rain while Claude's tools
  run. It goes a moment after the last one finishes. A matrix you started
  yourself is left alone.

## Your Glyphh account and plan

Drips comes with a Glyphh subscription. Sign in with a free Glyphh account,
and your plan sets what Drips can do.

**Sign in.** Open the page with `/drips` and press **Sign in to Glyphh**,
or run `/drips signin`. A Glyphh page opens in your browser with a short
code. Check the code matches the one Drips shows, then sign in with Google
or GitHub. Drips updates by itself. One sign-in covers every Glyphh mod on
your Mac. `/drips signout` signs the Mac out of all of them.

**What your plan unlocks.** Each plan sets two limits for Drips. The numbers
are set by the plan, and Glyphh's plans page lists them:

| Limit | What it sets |
| --- | --- |
| `custom_drips` | How many drips you can save |
| `fullscreen` | Effects over the whole screen. Without it, effects play in Claude's window |

When you reach a limit, Drips says which one, and which plan lifts it, with
an **Upgrade** button. Drips you already saved keep working. If your plan
doesn't include Drips, the page says so and offers **Upgrade**. Until you
sign in, effects don't play (`/drip list`, `delete` and `stop` still work).

**Upgrade and billing.** The Drips page shows your plan, with **Upgrade**
and **Manage billing**. Upgrade opens Glyphh's checkout in your browser, and
Drips picks up the new plan by itself. Manage billing opens the billing
page, where you change your card, see invoices, or cancel. Your org's admin
makes these changes.

**Offline.** Your plan is checked on your Mac, with a signed licence that
Drips renews in the background each day. Offline, it keeps working until
that licence runs out. After that, sign in again. On the Free plan, its
limits keep working.

## Where things are kept

Everything stays on your machine. Your saved drips are kept in Claude
Code's store for Drips. The fullscreen overlay program is kept in
`~/Library/Caches/glyphh-drips`. Your Glyphh sign-in is in
`~/.glyphh/install.json`, readable only by you, and your plan's licence is
in `~/.glyphh/license.json`. Every Glyphh mod shares them.

## Security

- The Drips page is served only on `127.0.0.1`, on a random port. Every
  request must carry a random key made for that session. The server
  refuses any other host name or origin, and the page can't be framed by
  another site.
- The session key is never written to a file or a log. The page is opened
  with a one-time address that stops working once it has been used.
- Each effect runs in a sandboxed frame that can run its own animation and
  nothing else: it can't reach the page, your files or the network.
- The fullscreen overlay is built on your Mac from the source in the
  plugin (`native/overlay.swift`). It shows one effect, ignores the
  pointer, closes when the effect ends or after its time limit (never more
  than 30 minutes), and quits if Claude Code goes away.
- Drips talks to Glyphh only to sign in, renew your plan's licence,
  upgrade, open billing and sign out. It sends your Mac's name, a one-way
  hash of its hardware ID and the mod's version, never your drips. The
  Glyphh token is never shown to the page or written to a log.

## For developers

This mod is built from the private source repository to the Glyphh mod standard
(`docs/mod-standard.md` there). Its account code in `hooks/licence/` is a copy of the
shared module: change the source and sync, never the copy.
