// The Ada part this version of the mod installs into rrotor: the Ada kernel
// and numpy, built and signed in rrotor's CI (rrotor/parts/ada), one tarball
// per architecture, carried by this mod's release as ASSETS. rrotor checks
// each tarball's SHA-256 and its signature with Glyphh's release public key
// before it unpacks anything. A developer's own build comes from /config
// (`part`: a folder holding ada-<version>-<arch>.tar.gz, .sha256 and .sig).
export const VERSION = '3.1.0'
/** Glyphh's release public key (base64 of its raw 32 bytes): what signs a part. Set by the release. */
export const RELEASE_PUBLIC_KEY = ''
export type Arch = 'amd64' | 'arm64'
export type Asset = { url: string; sha256: string; signature: string }
/** The part's tarballs, per architecture, as JSON `{amd64: {url, sha256, signature}, arm64: …}`: rrotor's
 *  part-ada release. Set by the release; empty while this build carries none. */
export const ASSETS_JSON = ''

/** The assets ASSETS_JSON names; null for an architecture it does not (or when it is not JSON). */
export function parseAssets(text: string): Record<Arch, Asset | null> {
  const none: Record<Arch, Asset | null> = { amd64: null, arm64: null }
  if (!text.trim()) return none
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return none
  }
  const d = (doc ?? {}) as Record<string, Partial<Asset> | null | undefined>
  const one = (a: Partial<Asset> | null | undefined): Asset | null =>
    a && typeof a.url === 'string' && typeof a.sha256 === 'string' && typeof a.signature === 'string' ? { url: a.url, sha256: a.sha256, signature: a.signature } : null
  return { amd64: one(d.amd64), arm64: one(d.arm64) }
}

export const ASSETS: Record<Arch, Asset | null> = parseAssets(ASSETS_JSON)

export const NO_PART = 'This build of Ada carries no Ada part yet. Set Ada part in /config to a folder with a local build of it (rrotor/parts/ada).'

/** The architecture rrotor runs on here, from `uname -m`. */
export const archOf = (uname: string): Arch => (uname.trim() === 'x86_64' ? 'amd64' : 'arm64')
export const fileStem = (arch: Arch) => `ada-${VERSION}-${arch}`

export type PartInstalled = { name: string; version: string; mod: string; arch: string }

/** Whether rrotor already holds this version of the part. */
export const installed = (parts: PartInstalled[]) => parts.some(p => p.name === 'ada' && p.version === VERSION)
