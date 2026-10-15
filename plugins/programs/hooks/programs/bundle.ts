// A program's folder at a commit, as rrotor deploys it: the commit's full SHA,
// its glyphh.json's name, and a git bundle of it in base64 (the mod's fetch
// carries text). The folder is never mounted into rrotor. Pure: git runs
// through `run`.
import type { RunResult } from './runtime.ts'

export type Run = (argv: string[]) => Promise<RunResult | null>
export type Bundle = { commit: string; name: string; bundle: string }

export class BundleError extends Error {}

const SHA = /^[0-9a-f]{40}$/

async function git(run: Run, folder: string, ...args: string[]): Promise<string> {
  const r = await run(['git', '-C', folder, ...args])
  if (!r || r.exitCode !== 0) throw new BundleError((r?.stderr || r?.stdout || 'git did not run').trim().split('\n')[0] ?? 'git failed')
  return r.stdout
}

export async function bundleOf(run: Run, folder: string, commit?: string): Promise<Bundle> {
  if (!folder.startsWith('/')) throw new BundleError('The folder must be an absolute path.')
  const sha = (await git(run, folder, 'rev-parse', '--verify', `${commit || 'HEAD'}^{commit}`)).trim()
  if (!SHA.test(sha)) throw new BundleError(`${commit || 'HEAD'} is not a commit here.`)
  let name: string
  try {
    name = String((JSON.parse(await git(run, folder, 'show', `${sha}:glyphh.json`)) as { name?: unknown }).name ?? '')
  } catch (err) {
    throw new BundleError(err instanceof BundleError ? `The commit has no glyphh.json at the folder's root (${err.message}).` : 'glyphh.json is not JSON.')
  }
  const head = await run(['git', '-C', folder, 'merge-base', '--is-ancestor', sha, 'HEAD'])
  const ref = head?.exitCode === 0 ? 'HEAD' : '--all'
  const r = await run(['/bin/sh', '-c', 'git -C "$1" bundle create - "$2" 2>/dev/null | /usr/bin/base64', 'sh', folder, ref])
  const bundle = (r?.stdout ?? '').replace(/\s+/g, '')
  if (r?.isStdoutTruncated) throw new BundleError('The commit is too big to deploy from here (over what the mod can carry).')
  if (!r || r.exitCode !== 0 || !bundle) throw new BundleError('git could not bundle the commit.')
  return { commit: sha, name, bundle }
}
