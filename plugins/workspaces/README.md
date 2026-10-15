# Workspaces

Workspaces sets up the Claude desktop app for a kind of work in one command.

A workspace is a grid. Each cell shows one of your **favourites**, a page
such as Gmail, Slack or Calendar, live and usable, or one of the app's
own panes (Files, Changes, Terminal). `/dip Comms` shows Gmail, Slack and
Calendar side by side in one **layout page** in the app's Browser pane.
`/dip IDE` opens Files, Changes and Terminal. `/dip back` returns to the
workspace you were in before.

Each favourite is one live page. Signed in once, it stays signed in, and it
keeps its place when you switch workspaces and come back.

Workspaces works in the Claude desktop app on a Mac.

## Requirements

- **Google Chrome**, installed in Applications. Workspaces runs its own
  copy of Chrome out of sight, which draws the pages.
- **Node.js 18 or newer** (https://nodejs.org), which runs the layout page.

If either one is missing, `/workspaces` and `/stream` tell you what to
install.

## Install

In Claude Code, run:

```
/plugin marketplace add glyphh-ai/glyphh
/plugin install workspaces@glyphh
```

Workspaces opens the app's panes from its **View** menu, so the Claude app
needs permission to control it: turn Claude on under System Settings ›
Privacy & Security › Accessibility.

To let Workspaces open the layout page without asking you each time, allow
this call in `~/.claude/settings.json`:

```json
"permissions": {
  "allow": ["mcp__Claude_Browser__preview_start"]
}
```

If you don't, and the app refuses the call, Workspaces asks Claude to open
the page for you.

## Commands

| Command | What it does |
|---|---|
| `/dip` | Lists your workspaces, numbered |
| `/dip 2`, `/dip Comms`, `/dip co` | Switches to a workspace by number, by name, or by the first letters of its name |
| `/dip back` | Returns to the workspace before; run it again to go back and forth |
| `/stream [workspace]` | Opens the layout page in the Browser pane |
| `/workspaces` | Opens the layout page on its workspace editor |
| `/workspaces signin` | Signs in to Glyphh |
| `/workspaces signout` | Signs this Mac out of Glyphh |
| `/files` | Shows the Files pane |
| `/diff` | Shows the Changes pane |
| `/term` | Shows the Terminal pane |
| `/browser [url]` | Shows the Browser pane, or opens a page in it |
| `/editor <name>` | Opens a file in the Files pane, by path or file name |

To hide a pane, add `off`: `/files off`. If Claude Code already has one of
these names, the pane command uses its other name instead (`/changes`,
`/terminal`, `/tabs`, `/edit`).

When you switch, Workspaces opens the app panes the workspace uses and
closes the others. If the workspace has favourites, it shows them in the
layout page: if the page is already open, it switches the layout inside
it; if not, it opens the page in the Browser pane. If the workspace has a
folder, the session moves there.

## The layout page

The layout page opens on the **wall**: your favourites and workspaces as
tiles, a page at a time. A workspace's tile shows its first four cells.
Swipe or click the dots to turn pages. Type to search: tiles that don't match
dim, Enter opens the best match, and Esc clears the search.

Press and hold a tile to edit the wall:

- Drag tiles to reorder them.
- Drop one tile on another to make a folder, or drop a tile on a folder to add it.
- Open a folder to rename it, or drag a tile out of the folder to put it back.
- Click ✕ to delete a favourite or a workspace, or to ungroup a folder.

The **dock** at the top holds Close all, Workspaces (the editor), New favourite
and any tile you drag into it. It magnifies under the pointer. While pages
are open it slides away, and it comes back when the pointer reaches the top.

A favourite opens as a live **card**. Cards fill columns two at a time. You
can:

- Drag the lines between cards to resize them.
- Drag a card by its header onto another card to swap them, or to the side to
  give it a column of its own.
- Expand a card, or close it. A closed page keeps its place for next time.
- Pin a card so that the next favourite you open replaces it.

A workspace opens as its grid of cards. Close all closes everything. A page
is never shown twice: opening a favourite that is already on screen moves it.
Opening a favourite while a workspace is up turns the workspace into loose
cards. Alt+1 to alt+9 open the first nine workspaces.

### Settings

The settings are in Claude's own `/config`, under Workspaces:

| Setting | Values | Default |
| --- | --- | --- |
| home | `wall`, or `last workspace` (opens what you had up last time) | wall |
| dock | `on`, or `off` (the dock's items lead the wall instead) | on |
| hide the dock behind cards | `on`, `off` | on |
| icons per page | `24`, `40`, `56` | 40 |

Claude can read a page in the layout page only through the `page_read`
tool. It asks first, under your permission settings, and it treats what it
reads as untrusted content.

## The workspace editor

`/workspaces`, or **Workspaces** in the layout page's dock, opens the
editor. Esc or the dock closes it.

**Your workspaces** shows each workspace as a card with a small picture of
its grid. Click **+ Add** to make a workspace, or click a card to edit one.
A workspace's page has:

- **Name**
- **Grid**: choose **Cols** × **Rows** (up to 25 each). Click a cell to
  select it, then choose what it shows: Empty, Files, Changes, Terminal, or
  one of your favourites. **→ Merge** joins the selected cell with the cell
  to its right, **↓ Merge** joins it with the cell below, and **Split**
  breaks a merged cell back into single cells.
- **Working folder**: the folder the session moves to. Type it, or click
  **Browse…** to choose it in the Mac's folder chooser. Leave it empty to
  keep the current folder.
- **Model** and **Effort**: what the session switches to when you open the
  workspace, for this session only (as `/model` and `/effort` do). Leave
  them on "Keep the session's…" to change nothing.
- **Cell setup**: which favourite each web cell shows. A favourite can
  appear only once in a workspace.
- **Save**, **Cancel**, **Delete** (Delete asks first), and **Open
  workspace**

**Favourites** lists your pages and the workspaces that show each one. Add
a favourite with a name and a web address, or click one to rename it or
change its address; the workspaces that show it keep working. Tick **Keep
in panel** for pages like Slack, Teams or Zoom: a link that would open the
desktop app, or a new window, then loads in the same cell instead. Without
it, a new window opens over the cell with a close button, and a link to
Slack, Teams, Zoom, Discord, Notion or Mail opens that app on your Mac. You can't
delete a favourite while a workspace still shows it; Workspaces tells you
which one.

The editor saves to the files in `~/.glyphh`, and Workspaces reads them
again straight away.

## Your Glyphh account and plan

Workspaces comes with a Glyphh subscription. Sign in with a free Glyphh
account, and your plan sets what Workspaces can do.

**Sign in.** Open the layout page with `/workspaces` and press **Sign in to
Glyphh**, or run `/workspaces signin`. A Glyphh page opens in Claude's browser
pane (in a terminal, the link is printed and copied) with a short code. Check the code matches the one Workspaces shows, then
sign in with Google or GitHub. Workspaces updates by itself. One sign-in
covers every Glyphh mod on your Mac. `/workspaces signout` signs the Mac out
of all of them.

**What your plan unlocks.** Each plan sets three limits for Workspaces. The
numbers are set by the plan, and Glyphh's plans page lists them:

| Limit | What it sets |
| --- | --- |
| `workspaces` | How many workspaces you can make |
| `favorites` | How many favourites you can keep |
| `stream` | The live layout page. Without it, `/dip` switches the app's panes and folder only, and `/stream` and `page_read` are off |

When you reach a limit, Workspaces says which one, and which plan lifts it,
with an **Upgrade** button. Workspaces you already have keep working. If
your plan doesn't include Workspaces, the layout page says so and offers
**Upgrade**. Until you sign in, `/dip`, `/stream`, the pane commands and
`page_read` don't run.

**Upgrade and billing.** The layout page's top bar shows your plan, with
**Upgrade** and **Manage billing**. Upgrade opens Glyphh's checkout in Claude's
browser pane, and Workspaces picks up the new plan by itself. Manage billing
opens the billing page, where you change your card, see invoices, or
cancel. Your org's admin makes these changes.

**Offline.** Your plan is checked on your Mac, with a signed licence that
Workspaces renews in the background each day. Offline, it keeps working
until that licence runs out. After that, sign in again. On the Free plan,
its limits keep working.

## Where things are kept

Everything stays on your machine:

- Each workspace is a file: `~/.glyphh/workspaces/<name>.json`.
- Favourites are in `~/.glyphh/favorites.json`.
- The wall's order, folders, dock and open cards are in `~/.glyphh/echo.json`.
- Sign-ins for the pages are kept in Chrome's own profile for Workspaces,
  in `~/Library/Application Support/glyphh-workspaces/chrome`.
- Your Glyphh sign-in is in `~/.glyphh/install.json`, readable only by you,
  and your plan's licence is in `~/.glyphh/license.json`. Every Glyphh mod
  shares them.

The first time it runs, Workspaces writes four favourites (Gmail, Slack
kept in panel, Calendar, Google) and four workspaces (Comms, IDE, Browse, Files). A
workspace you delete stays deleted. Workspaces from an earlier version are
read as they are, and their pages become favourites.

A workspace file looks like this:

```json
{
  "name": "Comms",
  "folder": null,
  "cols": 2,
  "rows": 2,
  "col_widths": [0.5, 0.5],
  "row_heights": [0.5, 0.5],
  "cells": [
    { "panel": "browser", "favorite": "gmail", "col": 0, "row": 0, "row_span": 2 },
    { "panel": "browser", "favorite": "slack", "col": 1, "row": 0 },
    { "panel": "browser", "favorite": "calendar", "col": 1, "row": 1 }
  ]
}
```

`panel` is `browser` (with the favourite's id), `files`, `changes` or
`terminal`. A merged cell has `col_span` or `row_span`, or both.

## Security

- The layout page is served only on `127.0.0.1`, on a random port. Every
  request, including the editor's saves, must carry a random key made for
  that session, and the server checks each save before it writes it. The server
  refuses any other host name or origin, and the page can't be framed by
  another site.
- The session key is never written to a file or a log. The page is opened
  with a one-time address that stops working once it has been used.
- Favicons come through the same server and need the same key. It fetches
  only `http` and `https` pages, and serves only small images.
- Workspaces controls its Chrome through a private pipe, not a network
  port, so no other program can take control of the signed-in pages.
- Workspaces talks to Glyphh only to sign in, renew your plan's licence,
  upgrade, open billing and sign out. It sends your Mac's name, a one-way
  hash of its hardware ID and the mod's version, never your pages or
  files. The Glyphh token is never shown to the page or written to a log.

## For developers

This mod is built from the private source repository to the Glyphh mod standard
(`docs/mod-standard.md` there). Its account code in `hooks/licence/` is a copy of the
shared module: change the source and sync, never the copy.
