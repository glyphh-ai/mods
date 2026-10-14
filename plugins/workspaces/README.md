# Workspaces

Workspaces sets up the Claude desktop app for a kind of work in one command.
A workspace names the app's panes to open (Files, Changes, Terminal,
Browser), the web pages to open as Browser tabs, and optionally a folder for
the session. `/dip Comms` opens Gmail, Slack and Calendar as tabs; `/dip IDE`
opens Files, Changes and Terminal; `/dip back` returns to the workspace you
were in before.

Workspaces works in the Claude desktop app.

## Install

In Claude Code, run:

```
/plugin marketplace add glyphh-ai/glyphh
/plugin install workspaces@glyphh
```

Workspaces opens the app's panes from its **View** menu, so the Claude app
needs permission to control it: turn Claude on under System Settings ›
Privacy & Security › Accessibility.

To let Workspaces open Browser tabs without asking each time, allow its
browser calls in `~/.claude/settings.json`:

```json
"permissions": {
  "allow": ["mcp__Claude_Browser__preview_start", "mcp__Claude_Browser__tabs_select"]
}
```

Without that, where the app refuses the call Workspaces asks Claude to open
the tabs instead.

## Commands

| Command | What it does |
|---|---|
| `/dip` | Lists your workspaces, numbered |
| `/dip 2`, `/dip IDE`, `/dip id` | Switches to a workspace by number, name or the start of its name |
| `/dip back` | Returns to the workspace before; run it again to go back and forth |
| `/workspaces` | Opens the Workspaces pane, where you create, rename and edit workspaces |
| `/workspaces key <licence>` | Unlocks Workspaces with a licence key |
| `/files` | Shows the Files pane |
| `/diff` | Shows the Changes pane |
| `/term` | Shows the Terminal pane |
| `/browser [url]` | Shows the Browser pane, or opens a page in it |
| `/editor <name>` | Opens a file in the Files pane, by path or file name |

Add `off` to hide a pane: `/files off`. If Claude Code already has one of
these names, the pane command takes its other name (`/changes`, `/terminal`,
`/tabs`, `/edit`).

A switch closes the panes the workspace doesn't list, opens the ones it does
in order, opens its tabs with the first one in front, and moves the session
to the workspace's folder if it has one. `/dip` reports each pane:
`Terminal ✓ · Changes ✓ · Files ✓`.

## The Workspaces pane

`/workspaces` lists your workspaces. Pick one to edit it:

- **Name**, and **Folder**: an absolute path, or blank to keep the session
  where it is
- **Model**, **Permission mode**, **Effort**: saved in the workspace's
  file. A switch doesn't change them for the session you're in.
- **Panes**: Files, Editor (the file `/editor` last opened), Changes,
  Terminal, Browser. A pane you turn on opens after the others.
- **Sidebar**: collapsed or shown
- **Tabs**: add a page by its address, or remove one
- **Delete workspace**

Type a name under **New workspace** to make one.

## Trial and unlock

Workspaces is free for 7 days. While the trial runs, the Workspaces pane
shows the days left and an **Unlock — $5** button.

When the trial ends, `/dip` and the pane commands stop working until you
unlock. Open `/workspaces` and press **Unlock — $5**. Checkout opens in your
browser, and Workspaces unlocks by itself once you've paid. This is a
one-off payment, not a subscription.

The licence is checked on your machine, so Workspaces never needs to contact
a server again after you unlock. To use it on another machine, press
**Copy licence key** in the Workspaces pane, then on the other machine run
`/workspaces key <licence>`.

## Where workspaces are kept

Each workspace is a file in `~/.glyphh/workspaces/<name>.json`, kept on
your machine. On first run, if that folder doesn't exist yet, Workspaces
writes four to start with: **Comms**, **IDE**, **Browse** and **Files**. A
workspace you delete stays deleted.

A file looks like this:

```json
{
  "name": "Comms",
  "folder": null,
  "model": null,
  "permission_mode": null,
  "effort": null,
  "desktop_panes": ["browser"],
  "collapse_sidebar": false,
  "tabs": [
    { "url": "https://mail.google.com", "name": "Gmail" },
    { "url": "https://app.slack.com", "name": "Slack" },
    { "url": "https://calendar.google.com", "name": "Calendar" }
  ]
}
```

`desktop_panes` takes `files`, `editor`, `changes`, `terminal` and
`browser`, opened in the order listed. You can edit the files by hand, and
Workspaces reads them at the start of each session.
