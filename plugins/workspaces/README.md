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
| `/workspaces` | Opens the Workspaces pane: your workspaces, and the way to the editor |
| `/workspaces key <licence>` | Unlocks Workspaces with a licence key |
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

The layout page has a tab for each workspace (alt+1 to alt+9 also switch).
You can drag the lines between cells to resize them, and the new sizes
are saved to the workspace. Click a page to type into it. Each cell has its
own back, reload and address bar.

Claude can read a page in the layout page only through the `page_read`
tool. It asks first, under your permission settings, and it treats what it
reads as untrusted content.

## The Workspaces pane

`/workspaces` lists your workspaces. Each one shows its shape, for example
"3 cells · Gmail, Slack, Calendar". **Open** switches to it, the same as
`/dip`. **Edit in layout page** opens the layout page on its workspace
editor.

## The workspace editor

In the layout page, **Workspaces…** in the top bar opens the editor.

**Your workspaces** shows each workspace as a card with a small picture of
its grid. Click **+ Add** to make a workspace, or click a card to edit one.
A workspace's page has:

- **Name**
- **Grid**: choose **Cols** × **Rows** (up to 25 each). Click a cell to
  select it, then choose what it shows: Empty, Files, Changes, Terminal, or
  one of your favourites. **→ Merge** joins the selected cell with the cell
  to its right, **↓ Merge** joins it with the cell below, and **Split**
  breaks a merged cell back into single cells.
- **Working folder**: the folder the session moves to. Leave it empty to
  keep the current folder.
- **Cell setup**: which favourite each web cell shows. A favourite can
  appear only once in a workspace.
- **Save**, **Cancel**, **Delete** (Delete asks first), and **Open
  workspace**

**Favourites** lists your pages and the workspaces that show each one. Add
a favourite with a name and a web address, or click one to rename it or
change its address; the workspaces that show it keep working. You can't
delete a favourite while a workspace still shows it; Workspaces tells you
which one.

The editor saves to the files in `~/.glyphh`, and Workspaces reads them
again straight away.

## Trial and unlock

Workspaces is free for 7 days. While the trial runs, the Workspaces pane
shows the days left and an **Unlock — $5** button.

When the trial ends, `/dip`, `/stream`, the pane commands and `page_read`
stop working until you unlock. Open `/workspaces` and press
**Unlock — $5**. Checkout opens in your browser, and Workspaces unlocks by
itself once you've paid. It's a one-off payment, not a subscription.

The licence is checked on your machine, so after you unlock, Workspaces
never needs to contact a server again. To use it on another machine, press
**Copy licence key** in the Workspaces pane, then run
`/workspaces key <licence>` on the other machine.

## Where things are kept

Everything stays on your machine:

- Each workspace is a file: `~/.glyphh/workspaces/<name>.json`.
- Favourites are in `~/.glyphh/favorites.json`.
- Sign-ins for the pages are kept in Chrome's own profile for Workspaces,
  in `~/Library/Application Support/glyphh-workspaces/chrome`.

The first time it runs, Workspaces writes four favourites (Gmail, Slack,
Calendar, Google) and four workspaces (Comms, IDE, Browse, Files). A
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
- Workspaces controls its Chrome through a private pipe, not a network
  port, so no other program can take control of the signed-in pages.
