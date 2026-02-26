import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomUUID } from "crypto"
import { authOptions } from "@/lib/auth"

export const runtime = "nodejs"

const ADMIN_EMAIL = "draguniteus@gmail.com"
const REPO_OWNER = "Draguniteus"
const REPO_NAME = "SparkieRadio"
const BRANCH = "main"

async function githubApi(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub API ${path} → ${res.status}: ${err}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth check ─────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden — station uploads are admin-only" }, { status: 403 })
    }

    // ── Guard GITHUB_TOKEN ─────────────────────────────────────────────────
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN
    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: "GITHUB_TOKEN not configured — add it to your environment variables" },
        { status: 500 }
      )
    }

    // ── Parse multipart ────────────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const title = (formData.get("title") as string | null)?.trim()
    const artist = (formData.get("artist") as string | null)?.trim() || undefined

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 })

    // Validate type
    const validTypes = ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/aac", "audio/wav", "audio/x-wav"]
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|ogg|aac|wav)$/i)) {
      return NextResponse.json({ error: "Only MP3, OGG, AAC, WAV files allowed" }, { status: 400 })
    }

    // Sanitize filename
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3"
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "." + ext
    const filePath = `songs/${safeName}`

    // ── Upload MP3 to GitHub ───────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const base64Content = Buffer.from(arrayBuffer).toString("base64")

    // Check if file already exists (need SHA to overwrite)
    let existingSha: string | undefined
    try {
      const existing = await githubApi(GITHUB_TOKEN, `contents/${filePath}?ref=${BRANCH}`)
      existingSha = existing.sha
    } catch {
      // File doesn't exist yet — fine
    }

    await githubApi(GITHUB_TOKEN, `contents/${filePath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `feat(radio): add ${safeName}`,
        content: base64Content,
        branch: BRANCH,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    })

    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`

    // ── Update playlist.json ───────────────────────────────────────────────
    let playlist: Array<{ id: string; title: string; artist?: string; url: string }> = []
    let playlistSha: string | undefined
    try {
      const playlistFile = await githubApi(GITHUB_TOKEN, `contents/playlist.json?ref=${BRANCH}`)
      playlistSha = playlistFile.sha
      // GitHub returns base64 with embedded newlines — trim() handles all whitespace
      const decoded = Buffer.from(playlistFile.content.trim(), "base64").toString("utf-8")
      playlist = JSON.parse(decoded)
    } catch {
      playlist = []
    }

    const existingIdx = playlist.findIndex(t => t.url === rawUrl)
    const trackEntry = {
      id: existingIdx >= 0 ? playlist[existingIdx].id : randomUUID(),
      title,
      ...(artist ? { artist } : {}),
      url: rawUrl,
    }

    if (existingIdx >= 0) {
      playlist[existingIdx] = trackEntry
    } else {
      playlist.push(trackEntry)
    }

    await githubApi(GITHUB_TOKEN, "contents/playlist.json", {
      method: "PUT",
      body: JSON.stringify({
        message: `feat(radio): update playlist — added "${title}"`,
        content: Buffer.from(JSON.stringify(playlist, null, 2) + "\n").toString("base64"),
        branch: BRANCH,
        ...(playlistSha ? { sha: playlistSha } : {}),
      }),
    })

    return NextResponse.json({
      success: true,
      track: trackEntry,
      url: rawUrl,
    })
  } catch (err) {
    console.error("[radio/upload] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
