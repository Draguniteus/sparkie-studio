import { WebContainer } from '@webcontainer/api'

let _wc: WebContainer | null = null
let _bootPromise: Promise<WebContainer> | null = null

export async function getWebContainer(): Promise<WebContainer> {
  if (_wc) return _wc
  if (_bootPromise) return _bootPromise
  _bootPromise = WebContainer.boot().then((wc) => { _wc = wc; return wc })
  return _bootPromise
}

export async function mountFiles(
  wc: WebContainer,
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
    const scripts = pkg.scripts || {}
    if (scripts.dev)   return { cmd: 'npm', args: ['run', 'dev'] }
    if (scripts.start) return { cmd: 'npm', args: ['start'] }
    if (scripts.serve) return { cmd: 'npm', args: ['run', 'serve'] }
  } catch {}
  return { cmd: 'node', args: ['index.js'] }
}
