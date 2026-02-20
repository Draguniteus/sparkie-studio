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

  const wcRef = useRef<unknown>(null)

  const runProject = useCallback(async (files: FileNode[]) => {
    const hasPackageJson = files.some((f) => f.name === 'package.json')
    if (!hasPackageJson) return false

    try {
      clearTerminalOutput()
      setContainerStatus('booting')
      setPreviewUrl(null)

      // Dynamic imports — never statically traced by webpack
      const { getWebContainer, mountFiles, getDevCommand } = await import('@/lib/webcontainer')
      const wc = await getWebContainer()
      wcRef.current = wc

      setContainerStatus('mounting')
      await mountFiles(wc, files.map((f) => ({ name: f.name, content: f.content })))

      setContainerStatus('installing')
      const install = await wc.spawn('npm', ['install'])
      install.output.pipeTo(new WritableStream({ write(d) { appendTerminalOutput(d) } }))
      const installExit = await install.exit
      if (installExit !== 0) { setContainerStatus('error'); return false }

      setContainerStatus('starting')
      const pkgFile = files.find((f) => f.name === 'package.json')
      const { cmd, args } = getDevCommand(pkgFile?.content ?? '{}')
      const dev = await wc.spawn(cmd, args)
      dev.output.pipeTo(new WritableStream({ write(d) { appendTerminalOutput(d) } }))

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 60_000)
        wc.on('server-ready', (_port: number, url: string) => {
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
    const wc = wcRef.current as Awaited<ReturnType<typeof import('@/lib/webcontainer')['getWebContainer']>>
    const parts = path.split('/')
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join('/')
      await wc.fs.mkdir(dir, { recursive: true }).catch(() => {})
    }
    await wc.fs.writeFile(path, content)
  }, [])

  return { runProject, writeFile, containerStatus }
}
