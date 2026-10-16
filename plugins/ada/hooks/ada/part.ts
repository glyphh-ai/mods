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
/** The part's tarballs on this mod's release, per architecture; null while this build carries none. */
export const ASSETS: Record<Arch, Asset | null> = { amd64: null, arm64: null }

export const NO_PART = 'This build of Ada carries no Ada part yet. Set Ada part in /config to a folder with a local build of it (rrotor/parts/ada).'

/** The architecture rrotor runs on here, from `uname -m`. */
export const archOf = (uname: string): Arch => (uname.trim() === 'x86_64' ? 'amd64' : 'arm64')
export const fileStem = (arch: Arch) => `ada-${VERSION}-${arch}`

export type PartInstalled = { name: string; version: string; mod: string; arch: string }

/** Whether rrotor already holds this version of the part. */
export const installed = (parts: PartInstalled[]) => parts.some(p => p.name === 'ada' && p.version === VERSION)
