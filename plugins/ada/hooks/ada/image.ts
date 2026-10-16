// The rrotor image this version of the mod runs, pinned by digest (the
// multi-arch index of ghcr.io/glyphh-ai/rrotor at that version): the runtime
// pulls exactly these bytes. A developer's own image comes from /config.
export const REPO = 'ghcr.io/glyphh-ai/rrotor'
export const VERSION = '0.1.0'
export const DIGEST = ''

/** The image to run: the developer's, as given, or the pinned one; null when this build pins none. */
export function imageOf(override: string): { image: string; pinned: boolean } | null {
  if (override.trim()) return { image: override.trim(), pinned: false }
  return DIGEST ? { image: `${REPO}:${VERSION}@${DIGEST}`, pinned: true } : null
}

export const NO_IMAGE = 'This build of Ada pins no rrotor image yet. Set rrotor image in /config to a local build of rrotor.'
