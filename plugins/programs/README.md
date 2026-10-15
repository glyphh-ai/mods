# Programs

Programs runs jobs you write with Claude in **rrotor**, a sandboxed runtime on
your own machine. Claude writes a program (a `glyphh.json` manifest and a
`program.py`) in a folder you choose, you commit it, and Claude deploys that
commit to rrotor and calls it. A program answers with a result: done, a
question for you, or a step that waits for your approval, which Claude asks
you about before it continues.

## What you need

- A Glyphh account with Programs in your plan (an add-on), signed in with
  `/programs signin`.
- A container runtime on your Mac: Apple's `container` (macOS 26 on Apple
  silicon), OrbStack, or Docker Desktop. Programs installs and starts rrotor
  itself; there is nothing else to install.
- `git`, for the program folders.

## Use it

Ask Claude, for example: "Write a program that adds up yesterday's sales
export and writes the total to a ledger, asking me first; deploy it and run
it." Claude uses the Programs tools:

| Tool | Does |
| --- | --- |
| `programs_list` | The programs in rrotor, their functions and versions |
| `program_deploy` | Deploys a folder at a commit (or a GitHub repo at a commit) |
| `program_call` | Runs a function and answers its result |
| `program_continue` | Answers a waiting run: your approval, or the value it asked for |
| `run_status` | A run's status and the last lines of its log |

`/programs` shows rrotor, its link to Glyphh and each layer of its sandbox;
`/programs start` and `/programs stop` start and stop it (its programs and
data are kept). A line under the prompt shows rrotor's state and how many
steps are waiting for you.

In `/config`: **Container runtime** (auto, container, orbstack, docker) and,
for developers, **rrotor image**.

## Plans

Programs is an add-on to a Glyphh subscription. Your plan sets how many
programs you may deploy (`programs`) and how many runs a day the mod starts
(`runs_per_day`).

## Your data

Programs, their files and their run logs stay in rrotor, on a container
volume on your machine (`glyphh-rrotor-data`). A folder you deploy is sent to
rrotor as a git bundle of that one commit; rrotor never sees your disk.
Glyphh's server sees only that your rrotor is online and the record of runs it
starts itself, never a program's inputs, data or code.

## Security

- rrotor's local API listens only on `127.0.0.1`. Every call carries a random
  local token that only this mod holds; rrotor keeps only its SHA-256, refuses
  any other host name and any web page.
- Every run is sandboxed: its own namespaces (bubblewrap), Landlock, a seccomp
  filter and limits; it sees only its own folder, and its network is only the
  hosts its manifest names, over HTTPS, through rrotor's egress proxy.
- rrotor gets its own token from Glyphh with your machine's sign-in; signing
  out cuts it off. It has no sign-in of its own and no Claude in it.

## For developers

This mod is built from the private source repository to the Glyphh mod standard
(`docs/mod-standard.md` there). Its account code in `hooks/licence/` is a copy of the
shared module: change the source and sync, never the copy. rrotor itself is
`glyphh-ai/rrotor`; its `docs/architecture.md` is the design this mod follows.
