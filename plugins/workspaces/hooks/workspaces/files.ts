// ~/.glyphh/workspaces/<slug>.json, one file per workspace, kept in the order
// the store remembers (new ones last). Works on a Disk, closures over `$`
// that ./hooks.tsx hands it.
import type { Entry, WorkspaceFile } from '../../types'
import { DEFAULTS } from './defaults.ts'
import { normalise, slugOf } from './model.ts'

export type Disk = {
  home(): Promise<string | undefined>
  read(path: string): Promise<string>
  write(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** The names of the files in a folder. */
  list(dir: string): Promise<string[]>
  remove(path: string): Promise<void>
  order: { get(): Promise<string[]>; set(slugs: string[]): Promise<void> }
}

async function dirOf(disk: Disk): Promise<string> {
  const home = await disk.home()
  if (!home) throw new Error('HOME is not set: there is nowhere to keep workspaces.')
  return `${home.replace(/\/$/, '')}/.glyphh/workspaces`
}

async function readEntry(disk: Disk, dir: string, name: string): Promise<Entry | null> {
  try {
    const file = normalise(JSON.parse(await disk.read(`${dir}/${name}`)))
    return file && { slug: name.slice(0, -'.json'.length), file }
  } catch {
    return null
  }
}

/** Every workspace file that reads, in the kept order. */
export async function readAll(disk: Disk): Promise<Entry[]> {
  const dir = await dirOf(disk)
  if (!(await disk.exists(dir))) return []
  const names = (await disk.list(dir)).filter(n => n.endsWith('.json')).sort()
  const entries: Entry[] = []
  for (const name of names) {
    const entry = await readEntry(disk, dir, name)
    if (entry) entries.push(entry)
  }
  const order = await disk.order.get()
  const rank = (slug: string) => (order.includes(slug) ? order.indexOf(slug) : order.length)
  return entries.sort((a, b) => rank(a.slug) - rank(b.slug))
}

async function write(disk: Disk, slug: string, file: WorkspaceFile): Promise<void> {
  await disk.write(`${await dirOf(disk)}/${slug}.json`, `${JSON.stringify(file, null, 2)}\n`)
}

/** First run (no workspaces folder yet): the built-in workspaces are written.
 *  A folder emptied on purpose stays empty. */
export async function loadOrSeed(disk: Disk): Promise<Entry[]> {
  if (await disk.exists(await dirOf(disk))) return readAll(disk)
  const entries = DEFAULTS.map(file => ({ slug: slugOf(file.name), file }))
  for (const e of entries) await write(disk, e.slug, e.file)
  await disk.order.set(entries.map(e => e.slug))
  return entries
}

function freeSlug(name: string, taken: Entry[]): string {
  const base = slugOf(name)
  let slug = base
  for (let i = 2; taken.some(e => e.slug === slug); i++) slug = `${base}-${i}`
  return slug
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

async function find(disk: Disk, name: string): Promise<{ all: Entry[]; entry: Entry }> {
  const all = await readAll(disk)
  const entry = all.find(e => e.file.name === name)
  if (!entry) throw new Error(`There is no workspace "${name}".`)
  return { all, entry }
}

export async function addWorkspace(disk: Disk, file: WorkspaceFile): Promise<void> {
  const all = await readAll(disk)
  if (all.some(e => sameName(e.file.name, file.name))) throw new Error(`There is already a workspace "${file.name}".`)
  const slug = freeSlug(file.name, all)
  await write(disk, slug, file)
  await disk.order.set([...all.map(e => e.slug), slug])
}

/** One workspace's file changed by `fn`, under the same slug. */
export async function patchWorkspace(disk: Disk, name: string, fn: (f: WorkspaceFile) => WorkspaceFile): Promise<void> {
  const { entry } = await find(disk, name)
  await write(disk, entry.slug, fn(entry.file))
}

/** Renamed: the file moves to the new name's slug and keeps its place. */
export async function renameWorkspace(disk: Disk, from: string, to: string): Promise<void> {
  const { all, entry } = await find(disk, from)
  if (all.some(e => e !== entry && sameName(e.file.name, to))) throw new Error(`There is already a workspace "${to}".`)
  const others = all.filter(e => e !== entry)
  const slug = slugOf(to) === entry.slug ? entry.slug : freeSlug(to, others)
  await write(disk, slug, { ...entry.file, name: to })
  if (slug !== entry.slug) await disk.remove(`${await dirOf(disk)}/${entry.slug}.json`)
  await disk.order.set(all.map(e => (e === entry ? slug : e.slug)))
}

export async function deleteWorkspace(disk: Disk, name: string): Promise<void> {
  const { all, entry } = await find(disk, name)
  await disk.remove(`${await dirOf(disk)}/${entry.slug}.json`)
  await disk.order.set(all.filter(e => e !== entry).map(e => e.slug))
}
