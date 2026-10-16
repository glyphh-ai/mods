# Glyphh mods (source)

This private repository is the source of every Glyphh mod: plugins that change
Claude's own interface and behaviour. `glyphh` is the account: a person signs
in once, free, and their plan sets what each mod on the account may do (its
limits, from the plan's licence). `drips` and `games` are bought once, per
machine, with no account. `ada` is designed.

Buyers never see this repository. They install from
[glyphh-ai/glyphh](https://github.com/glyphh-ai/glyphh), the public
marketplace:

```
/plugin marketplace add glyphh-ai/glyphh
/plugin install <mod>@glyphh
```

That repository holds only what a release build puts there: the README and
LICENSE it already has, `.claude-plugin/marketplace.json`, and one folder per
mod under `plugins/`. Nobody edits it by hand. The release workflow here
writes it.

## What is here

| Path | What it is |
| --- | --- |
| `plugins/<mod>/` | One mod: its manifest, hooks, helper, types, tests and README. Each loads on its own. |
| `shared/` | The modules copied into each plugin that uses them: `licence/` (the account), `unlock/` (bought once) and `overlay/` (drawing over Claude). See `shared/README.md`. |
| `release.json` | The live values a release swaps in: `SERVER` (the Glyphh server), `PUBLIC_KEY` (the key it signs licences with) and each bought-once plugin's `PAYMENT_LINK`. |
| `scripts/` | `sync-shared.mjs`, `check-shared.mjs` and `build.mjs`, with their tests in `scripts/test/`. |
| `.github/workflows/` | `checks.yml` runs on every push and pull request. `release.yml` runs on a `v*` tag. |
| `docs/mod-standard.md` | The standard every mod follows. Read it before starting one. |
| `LICENSE` | The buyers' licence, copied into each built mod. |

## Run a mod locally

Each mod needs Node 22 or later. While the mod API is behind its flag, every
command below needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
claude plugin test plugins/<mod>       # the mod's tests
claude plugin validate plugins/<mod>   # what the engine would refuse
tsc -p plugins/<mod>                   # types, once the engine has written .claude-plugin/types
```

There are three ways to load a mod while working on it:

- **Hot reloading in a session.** Link the plugin into the session's mods
  folder:

  ```sh
  ln -s "$PWD/plugins/<mod>" ~/.claude/dev-mods/<session-id>/<mod>
  ```

  Each turn that changes a file reloads the mod when the turn ends. The
  session asks once whether to turn hot reloading on.
- **One session.** Start it with `claude --plugin-dir plugins/<mod>`.
- **Sessions the desktop app starts.** Name the folder in
  `CLAUDE_CODE_PLUGIN_DIRS`.

The engine writes its API types into `plugins/<mod>/.claude-plugin/types/` the
first time it loads the mod. That folder is ignored by git and never ships.

## Add a mod

1. Read `docs/mod-standard.md`.
2. Make `plugins/<mod>/` in the standard layout. Write
   `hooks/licence/config.ts` with the mod's own values (`MOD`, `PRODUCT`,
   `ABOUT`, and `LIMITS`: the limit names the mod enforces).
3. Run `node scripts/sync-shared.mjs` to copy in the account module.
4. Ask for the mod and its limit names in the server's plans (each plan
   version's `mod_limits`), so the licence carries them.
5. Write the tests and the buyer README, ending with the developer footer.
6. Check it locally with `node scripts/check-shared.mjs`, then
   `claude plugin test` and `claude plugin validate` on the plugin, then
   `node scripts/build.mjs <mod> --dry-run --out /tmp/market`.

## Change a shared module

Edit `shared/licence/`, `shared/unlock/` or `shared/overlay/`, never a plugin's copy. Then run
`node scripts/sync-shared.mjs` and commit the source and the copies together.
`check-shared.mjs`, run in CI, fails when a copy differs from the source.

## Releases

1. Bump `version` in the plugin's `.claude-plugin/plugin.json` for each mod
   that changed. The build never changes versions.
2. Make sure `release.json` holds live values. The build refuses `TBD`, a
   server that isn't https, or a Stripe test Payment Link.
3. Tag and push the tag: `git tag v2026.10.15 && git push origin v2026.10.15`.
4. `release.yml` then does the following:
   - Checks the shared copies.
   - Runs every plugin's tests and validation.
   - Builds every mod into a checkout of glyphh-ai/glyphh.
   - Uploads the built marketplace as an artifact.
   - Commits and pushes the build, but only when the repository variable
     `PUBLISH_ENABLED` is `true`.

`PUBLISH_ENABLED` is **off** (unset) for now, so a release builds and shows
what would change without pushing.

To turn publishing on:

1. Create a fine-grained token with Contents read and write on
   glyphh-ai/glyphh only.
2. Store it here as the secret `GLYPHH_MARKETPLACE_TOKEN`.
3. Set the variable `PUBLISH_ENABLED` to `true`.

To see a build without releasing:

```sh
node scripts/build.mjs --all --dry-run --out /tmp/market
```

A dry run keeps the dev values where `release.json` still says `TBD`, and
says which ones it kept.

## What stays private

These stay in this repository and never go to buyers:

- tests
- tsconfig files
- the engine's types
- debug pages (`helper/debug/`)
- the scripts and workflows
- `release.json`
- `shared/` as a folder (buyers get only the copies inside each mod)
- this README and the standard

The build copies only a plugin's manifest, `.mcp.json`, `hooks/`, `helper/`,
`native/`, `mcp/` (its built server and card, not its source), `skills/`,
`types/`, README and LICENSE. No secret lives in any file: the server's
address and the licence's public key are public by design, the signing key
stays on the server, and each person's token stays in their own
`~/.glyphh/install.json`.

## Running against a local server

The dev source points at `http://localhost:8080` with the dev public key.
For a local server's licences to check out, run it with
`GLYPHH_LICENSE_KEY` set to the dev key's private half (base64 of its raw 32
bytes); a server started without one makes a new key, and the mods then
ignore its licences.
