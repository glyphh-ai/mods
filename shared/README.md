# The shared licence module

The one source of every mod's licence: a 7-day trial, then a one-off unlock
through a Stripe Payment Link, the licence checked offline with Ed25519.

`shared/licence/` is the source. Each plugin carries a copy in
`hooks/licence/` (a plugin loads on its own, so it cannot reach outside its
folder). Never edit a plugin's copy; edit `shared/licence/` and run `node scripts/sync-shared.mjs`. `node scripts/check-shared.mjs`
fails when a copy differs from this source.

- `__MOD__` in a file is written as the plugin's `MOD` (from its
  `hooks/licence/config.ts`) when it is copied: the engine reads atom
  references and command matchers as literals.
- `site.ts` holds the site and its public key (test values; the build swaps in
  the live ones from `release.json`).
- Each plugin's own `hooks/licence/config.ts` is the only file not copied:
  `MOD`, `PRODUCT`, `PRICE`, `ABOUT`, `PAYMENT_LINK` and `TRIAL_DAYS`.
- `vendor/ed25519.ts` is `@noble/ed25519`, vendored with its licence.

See `docs/mod-standard.md` for how a mod uses it.
