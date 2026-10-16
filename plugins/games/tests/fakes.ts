// Small helpers for the tests: process results, letting pending work run, and
// a licence signed by the server's dev key.
import type { ProcessRunResult } from 'claude-code'

export const done = (stdout = '', exitCode = 0, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/** Lets pending promise work run. */
export const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// Signed by the server's dev key for Games: a licence the mod takes as it ships (server.ts's dev key).
export const SITE_SIGNED_ARCADE =
  'eyJ2IjoxLCJtb2QiOiJnYW1lcyIsImluc3RhbGwiOiJ0ZXN0LWluc3RhbGwtMDAwMCIsInNlc3Npb24iOiJjc190ZXN0X2ZpeHR1cmUiLCJpc3N1ZWQiOiIyMDI2LTEwLTE1VDAwOjAwOjAwLjAwMFoifQ.4vBKJw1xDaef6G5cOd46AaE6Y7qb34hKTt0KM0J6DUtC32srXBajxgaTb6To2mbgaqRy8eXESoBo2rIcW9x-Aw'

// Signed by the server's dev key for Drips: another mod's licence, refused here.
export const SITE_SIGNED_DRIP =
  'eyJ2IjoxLCJtb2QiOiJkcmlwcyIsImluc3RhbGwiOiJ0ZXN0LWluc3RhbGwtMDAwMCIsInNlc3Npb24iOiJjc190ZXN0X2ZpeHR1cmUiLCJpc3N1ZWQiOiIyMDI2LTEwLTE1VDAwOjAwOjAwLjAwMFoifQ.vJqMXKry3SgS6FG7L8ij7-ORsBdUbUOqQl9UV6sDTJeP__Ms8XBg970Vpffh5f378CIEBTVTLUi7TMrxy0lDAA'
