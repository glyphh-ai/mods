// Which container runtime runs rrotor on this Mac: Apple's `container`
// (macOS 26 on Apple silicon: a VM per container), then OrbStack, then Docker
// (rrotor's docs/architecture.md, section 11). Pure: the commands it runs come
// in through `Sys`.
export type Kind = 'container' | 'orbstack' | 'docker'
export type Choice = 'auto' | Kind
export type Runtime = { kind: Kind; cli: string[] }
export type RunResult = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated?: boolean }
export type Sys = {
  run: (argv: string[]) => Promise<RunResult | null>
  exists: (path: string) => Promise<boolean>
  home: () => Promise<string | undefined>
}

export const CONTAINER = '/usr/local/bin/container'

const dockerPaths = (home: string | undefined) => [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  ...(home ? [`${home}/.orbstack/bin/docker`] : []),
  '/Applications/Docker.app/Contents/Resources/bin/docker',
]

const ok = (r: RunResult | null) => r !== null && r.exitCode === 0

async function firstDocker(sys: Sys): Promise<string | null> {
  for (const p of dockerPaths(await sys.home())) if (await sys.exists(p)) return p
  return null
}

/** Apple's container runs well from macOS 26, on Apple silicon only. */
export async function appleContainerFits(sys: Sys): Promise<boolean> {
  const version = (await sys.run(['/usr/bin/sw_vers', '-productVersion']))?.stdout.trim() ?? ''
  const arch = (await sys.run(['/usr/bin/uname', '-m']))?.stdout.trim() ?? ''
  return Number(version.split('.')[0]) >= 26 && arch === 'arm64'
}

async function tryContainer(sys: Sys): Promise<Runtime | null> {
  if (!(await sys.exists(CONTAINER)) || !(await appleContainerFits(sys))) return null
  return ok(await sys.run([CONTAINER, 'system', 'status'])) ? { kind: 'container', cli: [CONTAINER] } : null
}

async function tryOrbStack(sys: Sys, docker: string | null): Promise<Runtime | null> {
  if (!docker) return null
  const cli = [docker, '--context', 'orbstack']
  return ok(await sys.run([...cli, 'info', '--format', '{{.ServerVersion}}'])) ? { kind: 'orbstack', cli } : null
}

async function tryDocker(docker: string | null, sys: Sys): Promise<Runtime | null> {
  if (!docker) return null
  return ok(await sys.run([docker, 'info', '--format', '{{.ServerVersion}}'])) ? { kind: 'docker', cli: [docker] } : null
}

/** What to tell the person when no runtime answers. */
export async function missing(sys: Sys, choice: Choice): Promise<string> {
  if (choice !== 'auto') return `rrotor runs in ${NAMES[choice]}, which is not running here. Start it, or set Container runtime to auto in /config.`
  if (await appleContainerFits(sys))
    return "rrotor needs a container runtime. Install Apple's container (its signed installer from github.com/apple/container/releases; macOS asks for your password once), or OrbStack, then run /ada start."
  return 'rrotor needs a container runtime: install OrbStack (orbstack.dev) or Docker Desktop, then run /ada start.'
}

export const NAMES: Record<Kind, string> = { container: "Apple's container", orbstack: 'OrbStack', docker: 'Docker' }

/** The runtime to use: the one chosen in /config, or the first that answers. */
export async function detect(sys: Sys, choice: Choice): Promise<Runtime | { missing: string }> {
  const docker = await firstDocker(sys)
  const tries: Record<Kind, () => Promise<Runtime | null>> = {
    container: () => tryContainer(sys),
    orbstack: () => tryOrbStack(sys, docker),
    docker: () => tryDocker(docker, sys),
  }
  const order: Kind[] = choice === 'auto' ? ['container', 'orbstack', 'docker'] : [choice]
  for (const kind of order) {
    const found = await tries[kind]()
    if (found) return found
  }
  return { missing: await missing(sys, choice) }
}
