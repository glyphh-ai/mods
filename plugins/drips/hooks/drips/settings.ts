// The mod's /config rows (plugin.json `userConfig`), as `register` receives
// them: where effects play, and the two optional fun hooks (off unless set).
//
// `display` before 1.1.0 had two values: claude-window (then the Drips page
// in the Browser pane) and fullscreen. claude-window now means the overlay
// over Claude's window itself, and the page is browser-pane. A stored
// claude-window is kept as it is: it asked for effects over Claude's window,
// which the new default does, without the Browser pane; anyone who wants the
// page picks browser-pane. Nothing is rewritten in the person's settings.
import type { PluginOptions } from 'claude-code'

import type { Display } from '../../types'

export type Settings = {
  display: Display
  /** Confetti when a turn that ran longer than LONG_TURN_MS ends. */
  confettiAfterLongTurn: boolean
  /** A matrix rain while Claude's tools run. */
  matrixWhileTools: boolean
}

export const DEFAULT_SETTINGS: Settings = { display: 'claude-window', confettiAfterLongTurn: false, matrixWhileTools: false }

export const DISPLAYS: readonly Display[] = ['claude-window', 'fullscreen', 'browser-pane']

/** A stored `display` made whole: one of DISPLAYS, else the default. */
export function displayOf(value: unknown): Display {
  return DISPLAYS.find(d => d === value) ?? DEFAULT_SETTINGS.display
}

export function settingsOf(options: PluginOptions): Settings {
  return {
    display: displayOf(options.display),
    confettiAfterLongTurn: options.confetti_after_long_turn === true,
    matrixWhileTools: options.matrix_while_tools === true,
  }
}
