// An effect's document for a host of a given size, as the app's overlay
// windows load it: a one-shot (its opacity, when named, set on <body>) or a
// looping background; and how long a one-shot may stay before it is closed.
// A game's document is interactive: its overlay takes the pointer and keys.
import { buildLoopHtml, buildOneShotHtml, isGameEffect, oneShotSafetyMs } from './effects.ts'

export type Doc = { html: string; closeAfterMs: number; interactive: boolean }

export function oneShotDoc(effect: string, w: number, h: number, opacity: number, level?: number): Doc {
  let html = buildOneShotHtml(effect, w, h, level)
  if (opacity > 0) html = html.replace('<body>', `<body style="opacity:${opacity}">`)
  return { html, closeAfterMs: oneShotSafetyMs(effect), interactive: isGameEffect(effect) }
}

export function loopDoc(effect: string, w: number, h: number, opacity: number, maxMs: number): Doc {
  return { html: buildLoopHtml(effect, w, h, opacity), closeAfterMs: maxMs, interactive: false }
}
