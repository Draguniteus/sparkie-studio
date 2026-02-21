"use client"

import { useCallback, useRef } from 'react'
import { useAppStore, FileNode } from '@/store/appStore'

type WCInstance = import('@webcontainer/api').WebContainer
type WCTree = Record<string, unknown>

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

/**
 * Recursively builds WebContainer FileSystemTree from Zustand FileNode[].
 * Handles:
 *  - FileNode with type='folder' + children[] (tree structure)
 *  - FileNode with name containing '/' e.g. "public/index.html" (flat paths)
 */
function buildFileTree(files: FileNode[]): WCTree {
  const tree: WCTree = {}

  function insertPath(segments: string[], content: string, node: WCTree) {
    const [head, ...rest] = segments
    if (rest.length === 0) {
      node[head] = { file: { contents: content } }
    } else {
      if (!node[head] || typeof node[head] !== 'object' || !('directory' in (node[head] as object))) {
        node[head] = { directory: {} }
      }
      insertPath(rest, content, (node[head] as { directory: WCTree }).directory)
    }
  }

  for (const f of files) {
    if (f.type === 'folder') {
      tree[f.name] = { directory: buildFileTree(f.children ?? []) }
    } else {
      const segments = f.name.split('/').filter(Boolean)
      if (segments.length === 1) {
        tree[f.name] = { file: { contents: f.content } }
      } else {
        insertPath(segments, f.content, tree)
      }
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
    const hasPkg = projectFiles.some(
      f => f.name === 'package.json' || f.name.endsWith('/package.json')
    )
    if (!hasPkg) return false

    devProcessRef.current?.kill()
    devProcessRef.current = null
    clearTerminalOutput()
    setContainerStatus('booting')
    setPreviewUrl(null)
    appendTerminalOutput('[WC] Booting WebContainer...\r\n')

    let wc: WCInstance
    try { wc = await getContainer() }
    catch (e) {
      setContainerStatus('error')
      appendTerminalOutput('\r\n[ERROR] Failed to boot: ' + String(e) + '\r\n')
      return false
    }

    setContainerStatus('mounting')
    appendTerminalOutput('[WC] Mounting files...\r\n')
    try {
      const fileTree = buildFileTree(projectFiles)
      await wc.mount(fileTree as Parameters<typeof wc.mount>[0])
    } catch (e) {
      setContainerStatus('error')
      appendTerminalOutput('\r\n[ERROR] Mount failed: ' + String(e) + '\r\n')
      return false
    }

    setContainerStatus('installing')
    appendTerminalOutput('\r\n[WC] Running npm install...\r\n')
    try {
      const install = await wc.spawn('npm', ['install'])
      install.output.pipeTo(
        new WritableStream({ write(chunk) { appendTerminalOutput(chunk) } })
      )
      const code = await install.exit
      if (code !== 0) {
        setContainerStatus('error')
        appendTerminalOutput('\r\n[ERROR] npm install failed (exit ' + code + ')\r\n')
        return false
      }
    } catch (e) {
      setContainerStatus('error')
      appendTerminalOutput('\r\n[ERROR] Install error: ' + String(e) + '\r\n')
      return false
    }

    setContainerStatus('starting')
    appendTerminalOutput('\r\n[WC] Starting dev server...\r\n')
    try {
      const dev = await wc.spawn('npm', ['run', 'dev'])
      devProcessRef.current = { kill: () => dev.kill() }
      dev.output.pipeTo(
        new WritableStream({ write(chunk) { appendTerminalOutput(chunk) } })
      )
      wc.on('server-ready', (_port: number, url: string) => {
        setContainerStatus('ready')
        setPreviewUrl(url)
        appendTerminalOutput('\r\n[WC] Server ready -> ' + url + '\r\n')
      })
    } catch (e) {
      setContainerStatus('error')
      appendTerminalOutput('\r\n[ERROR] Dev server error: ' + String(e) + '\r\n')
      return false
    }
    return true
  }, [setContainerStatus, setPreviewUrl, appendTerminalOutput, clearTerminalOutput])

  const writeFile = useCallback(async (path: string, content: string) => {
    try {
      const wc = await getContainer()
      await wc.fs.writeFile(path, content)
    } catch { /* container not ready */ }
  }, [])

  return { runProject, writeFile }
}
