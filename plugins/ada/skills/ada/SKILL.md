---
name: ada
description: Build, deploy and call Ada models on the user's Glyphh runtime. Use when the user wants software (or Claude) to decide something the way it was decided before (route a ticket, pick the fix for an error, triage a lead, apply a policy), to remember outcomes so the next similar case is answered from precedent, or asks about Ada, their runtime, a model's spec, or deploying a model.
---

# Ada

An Ada model is a typed spec and a precedent store, in the user's own Glyphh runtime. Each case recorded with its
outcome becomes a precedent; a new case is answered from the precedents closest to it: the leading outcome, how
sure, and the precedents it stands on. The same question always gets the same answer, no language model is in the
path, and the model says when it does not know. Nothing of Glyphh's sees the data: the runtime is the user's.

## The runtime, and how you reach it

The user's runtime is a connector in Claude: its MCP at `https://<machine>.glyphh.app/mcp`, added once from the
Glyphh platform's Home page. Its tools are what you use:

| Tool | Does |
|---|---|
| `models_list` | The models deployed: versions, the active one, its functions |
| `model_deploy` `{repo, commit, token?}` | A commit of a model's GitHub repo as its next version |
| `model_call` `{model, function, inputs, version?, clearance?}` | Run a function: the first Result, with its data |
| `model_continue` `{run_id, answer}` | Answer a run that waits (`needs_input`, `needs_approval`) |
| `run_status`, `run_log` `{run_id}` | A run's status and last Result; its log lines |
| `approvals` | The runs waiting for the user |

No runtime connector: send the user to the Glyphh platform to start their runtime and add it (they need Ada on their
plan: it is an add-on). Never ask for a key or a token; the connector carries the sign-in.

## A model

A repo with three files; a version is a commit.

- `glyphh.json`: the manifest. `"needs": ["ada"]`, `"data": true`, and `functions`, each with a JSON Schema of its
  inputs. Every Ada model has `record {data, outcome?}`, `query {data}`, `facts {data, top?}`,
  `probabilities {data}`, `decide {data}` and `start`.
- `spec.json`: what a case looks like. `layers` of `segments` of `roles`; a role is a value (exact match), a
  `text_encoding: "bag_of_words"` text, a `numeric_config {min_value, max_value, bin_width}` number, or a key part
  (`key_part: true`, `similarity_weight: 0`). A layer or segment with `security_weight` (0 to 1) is cut from every
  answer for a caller whose `clearance` is below it: put owners, causes, internal notes there. `temporal_source`
  names the role that is the case's time. `seed` and `dimension` fix the encoding; changing them re-encodes the store
  on deploy. A role may carry `value_weights` (`{"negative": 1.0, "200 or more": 0.2}`: how much each value says;
  a number's key is its bin's lower edge), and `output.costs` is the cost matrix of deciding wrong
  (`{"good": {"bad": 5}, "bad": {"good": 1}}`: approving a bad loan costs five refusals of a good one); unset,
  every wrong answer costs 1. Both are usually learned, not written by hand (below).
- `model.py`: `from rrotor import Result, ada`; `load(ctx)` calls `ada.open(ctx, min_sim=...)`; each function reads
  `inputs`, uses `ctx.ada`, the kernel's `Model` (`record`, `query`, `facts`, `probabilities`, `calibrate`,
  `decide`, `spec`, `space`) with `clearance=ctx.clearance`, and answers `Result.done(data)`. `ctx.ada.decide(data)`
  answers `{outcome, expected_cost, probabilities}`: the outcome with the least expected cost under the calibrated
  probabilities and the spec's `output.costs`. A model's own `decide` function wraps that, or the plain `query`,
  with a bar: answer when it holds, else `ctx.needs_input(prompt)` to ask, then record the answer.

The worked example is `examples/ada_incidents` in `glyphh-ai/rrotor`: an app's incidents remembered, the fix for a
new error with the nearest precedent's cause, owner and runbook for a cleared caller. Start from it.

## Building one with the user

1. Agree the case: what comes in (the fields, which are exact, which are text, which are numbers on a scale, which
   are secret), what the outcome is (a short string: the decision), and who will call (people, a bot, software:
   their clearances).
2. Write `spec.json`, `glyphh.json` and `model.py`; tests on `rrotor.testing.Harness` (the example's tests show how).
3. If the user has past cases with their outcomes, learn the weights from them before the first commit, in a
   script beside the model: `Spec.from_json(spec).learned([(data, outcome), ...]).to_json()` written back to
   `spec.json`. Every role's weight becomes how much it tells about the outcome and every value's weight how far it
   moves it; roles that tell nothing drop to 0. Set `output.costs` with the user: what each wrong answer costs them.
   Do not learn from cases you will later test on; hold some out and report what they say.
4. Commit, push to the user's GitHub repo, `model_deploy` the commit. The runtime answers `{model, version}`.
5. Seed it: `model_call record` for each past case with its outcome (ten to fifty is a good start, hundreds is
   better). Then calibrate: a model function that calls `ctx.ada.calibrate(sample=N)` fits the probabilities to the
   store's own record (the temperature is saved with the store); run it again after a batch of new precedents.
6. Try it: `model_call query` and `decide` with new cases; `facts` to show why. Tune `min_sim`, the costs, the
   secured layers; redeploy.
7. Software calls it with a runtime key (made on the platform's Keys page) through `@glyphh-ai/ada` or `glyphh-ada`,
   or `POST https://<machine>.glyphh.app/v1/runs`.

## Reading an answer

`query` answers `{sufficient, confidence, support, count, top, outcomes, receipts}`. Act on `top` only when
`sufficient` is true and `confidence` clears the bar the user set (0.6 is the example's), and `count` is more than one
or two: a consensus of one is not consensus. `confidence` is a similarity-weighted vote, not a probability: for a
probability use `probabilities` (calibrated once the model has been), and for a decision that weighs what each
mistake costs use the kernel's `decide`. Where the probabilities make either answer costly (the example band: P of
the costly outcome between 0.1 and 0.3), the right move is to ask the person, not to guess; a model's `decide`
function asks (`needs_input`), you answer it with `model_continue`, and the answer is recorded as a new precedent.

What to expect: on a public credit data set with 800 cases learned and 200 held out (`benchmarks/credit` in
`glyphh-ai/rrotor`), the learned, calibrated model matched Claude judging the same cases on accuracy and on the
bank's cost, deterministically, at a few millionths of a dollar a decision; a thresholded logistic regression was a
little ahead on cost. Ada's edge is the receipts, the clearances and learning one confirmed case at a time, not
beating a classic model on numbers; say so when a user has purely numeric data and no need for those.

Record only outcomes the user or the world confirmed. Never record your own guess as a precedent.
