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
Glyphh platform's Home page with one Allow click (the runtime signs the user in through Glyphh; no key is typed).
Its tools are what you use:

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
  `probabilities {data}`, `learn {sample?}`, `decide {data}` and `start`.
- `spec.json`: what a case looks like. `layers` of `segments` of `roles`; a role is a value (exact match), a
  `text_encoding: "bag_of_words"` text (its words read through the kernel's seeded lexicon, and weighed by
  `learn`), a `numeric_config {min_value, max_value, bin_width}` number, or a key part
  (`key_part: true`, `similarity_weight: 0`). A layer or segment with `security_weight` (0 to 1) is cut from every
  answer for a caller whose `clearance` is below it: put owners, causes, internal notes there. `temporal_source`
  names the role that is the case's time. `seed` and `dimension` fix the encoding; changing them re-encodes the store
  on deploy. A role may carry `value_weights` (`{"negative": 1.0, "200 or more": 0.2}`: how much each value says;
  a number's key is its bin's lower edge), and `output.costs` is the cost matrix of deciding wrong
  (`{"good": {"bad": 5}, "bad": {"good": 1}}`: approving a bad loan costs five refusals of a good one); unset,
  every wrong answer costs 1. `output.ask` prices asking a person in the same units: set, `decide` says `ask`
  wherever every outcome's expected cost is above it. The weights are usually learned, not written by hand (below);
  the costs and the price of asking are the user's business numbers.
- `model.py`: `from rrotor import Result, ada`; `load(ctx)` calls `ada.open(ctx)`; each function reads
  `inputs`, uses `ctx.ada`, the kernel's `Model` (`record`, `query`, `facts`, `probabilities`, `learn`,
  `calibrate`, `refresh`, `decide`, `spec`, `space`) with `clearance=ctx.clearance`, and answers
  `Result.done(data)`. `ctx.ada.decide(data)` answers `{outcome, expected_cost, probabilities, ask}`: the outcome
  with the least expected cost under the calibrated probabilities and the spec's `output.costs`, and `ask` true
  when a person should answer instead (nothing known, or every answer dearer than `output.ask`). A model's own
  `decide` function returns that when `ask` is false, else `ctx.needs_input(prompt)` to ask, then records the
  answer. The model's levers live in `spec.json`'s `settings` (below, Tuning) and `refresh_every: 100` there makes
  the model learn its weights from its own store and recalibrate every hundred graded cases, so it follows its
  cases without a redeploy; the learned weights live with the store, over the spec file's.

The worked example is `examples/ada_incidents` in `glyphh-ai/rrotor`: an app's incidents remembered, the fix for a
new error with the nearest precedent's cause, owner and runbook for a cleared caller. Start from it.

## Building one with the user

1. Agree the case: what comes in (the fields, which are exact, which are text, which are numbers on a scale, which
   are secret), what the outcome is (a short string: the decision), and who will call (people, a bot, software:
   their clearances).
2. Write `spec.json`, `glyphh.json` and `model.py`; tests on `rrotor.testing.Harness` (the example's tests show how).
3. Set `output.costs` and `output.ask` with the user: what each wrong answer costs them, and what a person's
   answer costs. Open the model with `refresh_every` so it learns its weights from the cases it records (every
   role's weight becomes how much it tells about the outcome, every value's how far it moves it; roles that tell
   nothing drop to 0). With past cases on hand before the first commit, the same can be done up front:
   `Spec.from_json(spec).learned([(data, outcome), ...]).to_json()` written back to `spec.json`. Do not learn
   from cases you will later test on; hold some out and report what they say.
4. Commit, push to the user's GitHub repo, `model_deploy` the commit. The runtime answers `{model, version}`.
5. Seed it: `model_call record` for each past case with its outcome (ten to fifty is a good start, hundreds is
   better). Then `model_call learn`: the model weighs its roles by what its own precedents say and calibrates its
   probabilities, both saved with the store; it answers the roles' weights, which tell the user what their cases
   actually turn on. With `refresh_every` set the model does this on its own as cases arrive; call `learn` again
   after a batch of new precedents otherwise. It needs ten graded precedents of two outcomes.
6. Try it: `model_call query` and `decide` with new cases; `facts` to show why. Tune the levers live with
   `model_call settings {changes}` (below, Tuning); change the costs, the secured layers and the shape in
   `spec.json` and redeploy.
7. Software calls it with a runtime key (made on the platform's Keys page) through `@glyphh-ai/ada` or `glyphh-ada`,
   or `POST https://<machine>.glyphh.app/v1/runs`.

## Tuning

Every lever is a setting, declared in `spec.json`'s `settings` and changeable live with `model_call settings
{changes: {...}}` (kept with the store, over the spec's, until changed again; `model_call settings {}` reads them
all). A learning lever moved relearns the store there and then. The levers, with their defaults:

| Setting | Default | What it does |
|---|---|---|
| `k` | 15 | How many nearest precedents a query votes over |
| `min_sim` | 0.10 | The weighted similarity a precedent needs to vote: higher means "say nothing rather than guess" |
| `word_weights` | true | Learn a weight per word of a text role (which words matter) |
| `word_floor` | 0.35 | The least a learned word weighs; lower lets the telling words dominate, higher keeps every word voting |
| `interactions` | true | Learn pairs of roles that tell more together than apart |
| `max_interactions` | 5 | How many pairs at most |
| `rare` | 5 | A value, word or pair seen fewer times than this is not learned from |
| `calibrate_by` | loss | `loss`: probabilities that mean what they say; `cost`: that decide best by `output.costs` |
| `calibrate_sample` | 200 | The newest precedents a calibration holds out |
| `refresh_every` | none | Learn and calibrate again every so many graded records |
| `lexicon` | true | Read a text role's words through the kernel's seeds (WordNet's 77,817 words with synonyms and near words, the Moby list's 192,960 forms with their parts of speech), so related words correlate |
| `word_pairs` | false | Learn pairs of common words that tell more together than apart ("top" + "up"); for a model whose intents are phrases |
| `max_word_pairs` | 20 | How many word pairs at most |
| `word_evidence` | 2 | How much a case's words, by what each says of every outcome, weigh on the vote (0: not at all); the weight per word per outcome a classic text model has |

How to tune honestly: hold some cases out, change one lever, `learn`, score the held-out cases, keep what helped.
Never score on the cases the model learned from. The benchmarks in `glyphh-ai/rrotor` (`benchmarks/credit`,
`benchmarks/banking77`) show the method and what each lever did on real data.

## Reading an answer

`query` answers `{sufficient, confidence, support, count, top, outcomes, receipts}`. Act on `top` only when
`sufficient` is true and `confidence` clears the bar the user set (0.6 is the example's), and `count` is more than one
or two: a consensus of one is not consensus. `confidence` is a similarity-weighted vote, not a probability: for a
probability use `probabilities` (calibrated once the model has been), and for a decision that weighs what each
mistake costs use the kernel's `decide`. Where every answer is dearer than asking (`ask` true), the right move is
to ask the person, not to guess; a model's `decide` function asks (`needs_input`), you answer it with
`model_continue`, and the answer is recorded as a new precedent. The price of asking sets how often: on the credit
data below, asking at half a refused good loan sent nearly half the cases to a person and decided the rest at a
quarter of the cost.

What to expect: on a public credit data set with 800 cases learned and 200 held out (`benchmarks/credit` in
`glyphh-ai/rrotor`), the learned, calibrated model matched Claude judging the same cases on accuracy and on the
bank's cost, deterministically, at a few millionths of a dollar a decision; a thresholded logistic regression was a
level with it on cost. Ada's edge is the receipts, the clearances and learning one confirmed case at a time, not
beating a classic model on numbers; say so when a user has purely numeric data and no need for those.

Record only outcomes the user or the world confirmed. Never record your own guess as a precedent.
