// The Glyphh server every mod signs in with and takes its plan's licence
// from, and the public key the licence is checked with. Dev values:
// scripts/build.mjs swaps in the live ones from release.json.
export const SERVER = 'http://localhost:8080'
export const PUBLIC_KEY = 'LBZCuL7YrfirHogb_N5Iai0lQDaig-3VP8watWltwf0'

/** The files every Glyphh mod on this machine shares, under ~/.glyphh. */
export const INSTALL_FILE = 'install.json'
export const LICENSE_FILE = 'license.json'

/** How often the shared files are read again (another mod may have signed
 *  in or out) and a due refresh is made. */
export const WATCH_MS = 5_000
/** After a refresh that failed (offline), the wait before the next. */
export const RETRY_MS = 60_000
/** After checkout opens, how often and how long the licence is asked for a new plan. */
export const UPGRADE_POLL_MS = 5_000
export const UPGRADE_WAIT_MS = 15 * 60_000
