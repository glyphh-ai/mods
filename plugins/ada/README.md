# Ada

Ada runs your models in **rrotor**, a sandboxed runtime on your own machine.
An Ada model is a spec and a small model file: it records precedents and
answers from the ones closest to a new case, citing them. Claude writes a
model with you, you commit it, and Claude deploys that commit to rrotor and
calls it. Nothing is trained; a model learns from what it records.

## What you need

- A Glyphh account with Ada in your plan (an add-on), signed in with
  `/ada signin`.
- A container runtime on your Mac: Apple's `container` (macOS 26 on Apple
  silicon), OrbStack, or Docker Desktop. Ada installs and starts rrotor
  itself, and installs the Ada part (the kernel) into it; there is nothing
  else to install.
- `git`, for the model folders.

## Use it

Ask Claude, for example: "Make a model that triages support tickets from how
we handled the last ones; deploy it and try it on this one." Claude uses the
Ada tools:

| Tool | Does |
| --- | --- |
| `ada_models` | The models in rrotor, their functions and versions |
| `ada_deploy` | Deploys a folder at a commit (or a GitHub repo at a commit) |
| `ada_call` | Calls a model's function and answers its result |
| `ada_continue` | Answers a waiting run: your approval, or the value it asked for |
| `ada_run` | A run's status and the last lines of its log |

A model's folder holds `glyphh.json` (its manifest: `"needs": ["ada"]`,
`"data": true`, its functions), `spec.json` (what a record looks like) and
`model.py` (its functions, on `rrotor.ada`). rrotor's `examples/ada_tickets`
is one to start from.

`/ada` shows rrotor, its link to Glyphh, the parts and licence it holds, and
each layer of its sandbox; `/ada start` and `/ada stop` start and stop it (its
models and their precedents are kept); `/ada part` installs the Ada part
again. A line under the prompt shows rrotor's state and how many steps are
waiting for you.

In `/config`: **Container runtime** (auto, container, orbstack, docker) and,
for developers, **rrotor image** and **Ada part** (a folder with a local build
of the part, from rrotor's `parts/ada`).

## What the plan sets

The licence names how many models you may deploy (`models`) and how many
precedents a model may hold (`precedents`). Ada hands rrotor the licence; a
model past the plan's precedents refuses to record more until the plan
grows. A model is called with your clearance, which cuts what its answers
show.

## Privacy

Your models, their precedents and their data stay in rrotor on your machine.
Glyphh holds your account, your plan and the record of which models and
versions you deployed, never their content.

---

Made by Glyphh AI. Questions: hello@glyphh.ai.
