// What makes the shared one-time unlock module (shared/unlock) this mod's: the
// only file of hooks/unlock/ that is the mod's own. The build swaps
// PAYMENT_LINK for the live one in release.json.
export const MOD = 'drips'
/** The command the unlock answers on: /drips unlock, /drips key <licence>. */
export const COMMAND = 'drips'
/** Stripe test Payment Link, $8 (the site's LICENCE_PAYMENT_LINKS maps drips to plink_1UQwvo1Vx5mZZ7Iaek8fkA7t). */
export const PAYMENT_LINK = 'https://buy.stripe.com/test_cNi6oAcNq9NS2AndKJc7u03'

/** The mod's name as people read it, and its price: once, per machine. */
export const PRODUCT = 'Drips'
export const PRICE = '$8'

/** What the mod does, shown until it is bought. */
export const ABOUT = [
  'Drips plays visual effects over Claude, with sound: confetti, fireworks, hearts, a matrix rain and more.',
  '/drips confetti plays one; /drips 3 hearts stars plays several in turn; /drips -1 aurora keeps one going until /drips stop.',
  'Save your own recipes, play them by name, and let Claude play them too.',
]
