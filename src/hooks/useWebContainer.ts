"use client"

import { useCallback, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import type { FileNode } from '@/store/appStore'

export function useWebContainer() {
  const {
    setContainerStatus,
    setPreviewUrl,
    appendTerminalOutput,
    clearTerminalOutput,
    containerStatus,
  } = useAppStore()

  const wcRef = useRef<import('@webcontainer/api').WebContainer | null>(null)

  const runProject = useCallback(async (files: FileNode[]) => {
    // Only run if there's a package.json — else fall back to static preview
    const hasPackageJson = files.some((f) => f.name === 'package.json')
    if (!hasPackageJson) return false

    try {
      clearTerminalOutput()
      setContainerStatus('booting')
      setPreviewUrl(null)

      const { getWebContainer, mountFiles, getDevCommand } = await import('@/lib/webcontainer')
      const wc = await getWebContainer()
      wcRef.current = wc

      // Mount files
      setContainerStatus('mounting')
      await mountFiles(wc, files.map((f) => ({ name: f.name, content: f.content })))

      // npm install
      setContainerStatus('installing')
      const installProcess = await wc.spawn('npm', ['install'])
      installProcess.output.pipeTo(
        new WritableStream({
          write(data) { appendTerminalOutput(data) },
        })
      )
      const installExit = await installProcess.exit
      if (installExit !== 0) {
        setContainerStatus('error')
        return false
      }

      // Start dev server
      setContainerStatus('starting')
      const pkgFile = files.find((f) => f.name === 'package.json')
      const { cmd, args } = getDevCommand(pkgFile?.content ?? '{}')
      const devProcess = await wc.spawn(cmd, args)
      devProcess.output.pipeTo(
        new WritableStream({
          write(data) { appendTerminalOutput(data) },
        })
      )

      // Wait for server-ready event
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server start timeout')), 60_000)
        wc.on('server-ready', (_port, url) => {
          clearTimeout(timeout)
          setPreviewUrl(url)
          setContainerStatus('ready')
          resolve()
        })
      })

      return true
    } catch (err) {
      console.error('WebContainer error:', err)
      appendTerminalOutput(`\r\n\x1b[31mError: ${err}\x1b[0m\r\n`)
      setContainerStatus('error')
      return false
    }
  }, [setContainerStatus, setPreviewUrl, appendTerminalOutput, clearTerminalOutput])

  const writeFile = useCallback(async (path: string, content: string) => {
    if (!wcRef.current) return
    const parts = path.split('/')
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/')
      await wcRef.current.fs.mkdir(dir, { recursive: true }).catch(() => {})
    }
    await wcRef.current.fs.writeFile(path, content)
  }, [])

  return { runProject, writeFile, containerStatus }
}
