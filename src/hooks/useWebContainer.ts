"use client"

import { useCallback, useRef } from 'react'
import { useAppStore, FileNode } from '@/store/appStore'

type WCInstance = import('@webcontainer/api').WebContainer

let globalWC: WCInstance | null = null
let bootPromise: Promise<WCInstance> | null = null

async function getContainer(): Promise<WCInstance> {
  if (globalWC) return globalWC
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const { WebContainer } = await import('@webcontainer/api')
    const wc = await WebContainer.boot()
    globalWC = wc
    return wc
  })()
  return bootPromise
}

function buildFileTree(files: FileNode[]): Record<string, unknown> {
  const tree: Record<string, unknown> = {}
  for (const f of files) {
    if (f.type === 'folder') {
      tree[f.name] = { directory: buildFileTree(f.children ?? []) }
    } else {
      tree[f.name] = { file: { contents: f.content } }
    }
  }
  return tree
}

export function useWebContainer() {
  const {
    setContainerStatus, setPreviewUrl,
    appendTerminalOutput, clearTerminalOutput,
  } = useAppStore()
  const devProcessRef = useRef<{ kill: () => void } | null>(null)

  const runProject = useCallback(async (projectFiles: FileNode[]): Promise<boolean> => {
    const hasPkg = projectFiles.some(f => f.name === 'package.json')
    if (!hasPkg) return false

    devProcessRef.current?.kill()
    devProcessRef.current = null
    clearTerminalOutput()
    setContainerStatus('booting')
    setPreviewUrl(null)
    appendTerminalOutput('\u26a1 Booting WebContainer\u2026\r\n')

    let wc: WCInstance
    try { wc = await getContainer() }
    catch (e) {
      setContainerStatus('error')
      appendTerminalOutput(`\r\n\ud83d\udd34 Failed to boot: ${e}\r\n`)
      return false
    }

    setContainerStatus('mounting')
    appendTerminalOutput('\ud83d\udcc1 Mounting files\u2026\r\n')
    try { await wc.mount(buildFileTree(projectFiles) as Parameters<typeof wc.mount>[0]) }
    catch (e) {
      setContainerStatus('error')
      appendTerminalOutput(`\r\n\ud83d\udd34 Mount failed: ${e}\r\n`)
      return false
    }

    setContainerStatus('installing')
    appendTerminalOutput('\r\n\ud83d\udce6 npm install\r\n')
    try {
      const install = await wc.spawn('npm', ['install'])
      install.output.pipeTo(new WritableStream({ write(chunk) { appendTerminalOutput(chunk) } }))
      const code = await install.exit
      if (code !== 0) {
        setContainerStatus('error')
        appendTerminalOutput(`\r\n\ud83d\udd34 npm install failed (exit ${code})\r\n`)
        return false
      }
    } catch (e) {
      setContainerStatus('error')
      appendTerminalOutput(`\r\n\ud83d\udd34 Install error: ${e}\r\n`)
      return false
    }

    setContainerStatus('starting')
    appendTerminalOutput('\r\n\ud83d\ude80 npm run dev\r\n')
    try {
      const dev = await wc.spawn('npm', ['run', 'dev'])
      devProcessRef.current = { kill: () => dev.kill() }
      dev.output.pipeTo(new WritableStream({ write(chunk) { appendTerminalOutput(chunk) } }))
      wc.on('server-ready', (_port: number, url: string) => {
        setContainerStatus('ready')
        setPreviewUrl(url)
        appendTerminalOutput(`\r\n\ud83d\udfe2 Server ready \u2192 ${url}\r\n`)
      })
    } catch (e) {
      setContainerStatus('error')
      appendTerminalOutput(`\r\n\ud83d\udd34 Dev server error: ${e}\r\n`)
      return false
    }
    return true
  }, [setContainerStatus, setPreviewUrl, appendTerminalOutput, clearTerminalOutput])

  const writeFile = useCallback(async (path: string, content: string) => {
    try { const wc = await getContainer(); await wc.fs.writeFile(path, content) }
    catch { /* container not ready */ }
  }, [])

  return { runProject, writeFile }
}
