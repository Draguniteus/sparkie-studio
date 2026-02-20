/**
 * WebContainer singleton — browser only, loaded dynamically.
 * Never import this at module level in a server-rendered component.
 * Always use: const { getWebContainer } = await import('@/lib/webcontainer')
 */

// Lazy-loaded WC instance
let _wc: unknown | null = null
let _bootPromise: Promise<unknown> | null = null

export async function getWebContainer() {
  if (_wc) return _wc as import('@webcontainer/api').WebContainer
  if (_bootPromise) return _bootPromise as Promise<import('@webcontainer/api').WebContainer>

  const { WebContainer } = await import('@webcontainer/api')
  _bootPromise = WebContainer.boot().then((wc) => {
    _wc = wc
    return wc
  })
  return _bootPromise as Promise<import('@webcontainer/api').WebContainer>
}

export function isWebContainerSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof crossOriginIsolated !== 'undefined' &&
    (crossOriginIsolated as boolean)
  )
}

export async function mountFiles(
  wc: import('@webcontainer/api').WebContainer,
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

export function needsNpm(files: Array<{ name: string }>): boolean {
  return files.some((f) => f.name === 'package.json' || f.name.endsWith('/package.json'))
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
