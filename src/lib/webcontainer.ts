/**
 * WebContainer utilities.
 * Uses only dynamic imports — no static @webcontainer/api import at module level.
 */

type WCType = typeof import('@webcontainer/api')['WebContainer']
type WCInstance = InstanceType<WCType>

let _wc: WCInstance | null = null
let _bootPromise: Promise<WCInstance> | null = null

export async function getWebContainer(): Promise<WCInstance> {
  if (_wc) return _wc
  if (_bootPromise) return _bootPromise
  // Dynamic import inside function body — webpack cannot trace this statically
  _bootPromise = import('@webcontainer/api').then(({ WebContainer }) =>
    WebContainer.boot().then((wc) => { _wc = wc; return wc })
  )
  return _bootPromise
}

export async function mountFiles(
  wc: WCInstance,
  files: Array<{ name: string; content: string }>
): Promise<void> {
  for (const file of files) {
    const parts = file.name.split('/')
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/')
      await wc.fs.mkdir(dir, { recursive: true }).catch(() => {})
    }
    await wc.fs.writeFile(file.name, file.content)
  }
}

export function getDevCommand(pkgJson: string): { cmd: string; args: string[] } {
  try {
    const pkg = JSON.parse(pkgJson)
    const s = pkg.scripts || {}
    if (s.dev)   return { cmd: 'npm', args: ['run', 'dev'] }
    if (s.start) return { cmd: 'npm', args: ['start'] }
    if (s.serve) return { cmd: 'npm', args: ['run', 'serve'] }
  } catch {}
  return { cmd: 'node', args: ['index.js'] }
}
