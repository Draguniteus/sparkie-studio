import { WebContainer } from '@webcontainer/api'

let instance: WebContainer | null = null
let bootPromise: Promise<WebContainer> | null = null

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance
  if (bootPromise) return bootPromise

  bootPromise = WebContainer.boot().then((wc) => {
    instance = wc
    return wc
  })
  return bootPromise
}

export function isWebContainerSupported(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated
  )
}

/** Write a virtual file tree into the WebContainer file system */
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

/** Detect if the project needs npm install (has a package.json) */
export function needsNpm(files: Array<{ name: string }>): boolean {
  return files.some((f) => f.name === 'package.json' || f.name.endsWith('/package.json'))
}

/** Detect dev server start command from package.json scripts */
export function getDevCommand(pkgJson: string): { cmd: string; args: string[] } {
  try {
    const pkg = JSON.parse(pkgJson)
    const scripts = pkg.scripts || {}
    if (scripts.dev) return { cmd: 'npm', args: ['run', 'dev'] }
    if (scripts.start) return { cmd: 'npm', args: ['start'] }
    if (scripts.serve) return { cmd: 'npm', args: ['run', 'serve'] }
  } catch {}
  return { cmd: 'node', args: ['index.js'] }
}
