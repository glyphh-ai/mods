# ada

Ada, in Claude: a skill. An Ada model is a typed spec and a precedent store that lives in your own Glyphh runtime,
deployed by commit, run with no network, and called by Claude, by Claude's routines and by your own software at the
runtime's address. This plugin carries the skill: when to reach for Ada, how to write a model, how to deploy it and
call it.

It installs nothing and runs nothing on your machine. Your runtime is on the Glyphh platform
(https://app.glyphh.ai): start it there, connect Claude to its address once with one Allow click (Settings → Connectors → the URL shown
on Home), and the skill does the rest with the runtime's own tools (`models_list`, `model_deploy`, `model_call`,
`model_continue`, `run_status`, `run_log`, `approvals`).

Ada is an add-on on the Glyphh account: `models` and `precedents` per plan. The SDKs for your own software are
`@glyphh-ai/ada` and `glyphh-ada` (github.com/glyphh-ai/ada).
