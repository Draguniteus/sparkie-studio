import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const ADMIN_EMAIL = "draguniteus@gmail.com"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const REPO_OWNER = "Draguniteus"
const REPO_NAME = "SparkieRadio"
const BRANCH = "main"

async function githubApi(path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub API ${path} \u2192 ${res.status}: ${err}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  // \u2500\u2500 Auth check \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden \u2014 station uploads are admin-only" }, { status: 403 })
  }

  // \u2500\u2500 Parse multipart \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

  // \u2500\u2500 Upload MP3 to GitHub \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const arrayBuffer = await file.arrayBuffer()
  const base64Content = Buffer.from(arrayBuffer).toString("base64")

  // Check if file already exists (to get SHA for update)
  let existingSha: string | undefined
  try {
    const existing = await githubApi(`contents/${filePath}?ref=${BRANCH}`)
    existingSha = existing.sha
  } catch {
    // File doesn't exist \u2014 that's fine
  }

  await githubApi(`contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `feat(radio): add ${safeName}`,
      content: base64Content,
      branch: BRANCH,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  })

  const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`

  // \u2500\u2500 Update playlist.json \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  let playlist: Array<{ id: string; title: string; artist?: string; url: string }> = []
  let playlistSha: string | undefined
  try {
    const playlistFile = await githubApi(`contents/playlist.json?ref=${BRANCH}`)
    playlistSha = playlistFile.sha
    const decoded = Buffer.from(playlistFile.content.replace(/\n/g, ""), "base64").toString("utf-8")
    playlist = JSON.parse(decoded)
  } catch {
    playlist = []
  }

  const existingIdx = playlist.findIndex(t => t.url === rawUrl)
  const trackEntry = {
    id: existingIdx >= 0 ? playlist[existingIdx].id : crypto.randomUUID(),
    title,
    ...(artist ? { artist } : {}),
    url: rawUrl,
  }

  if (existingIdx >= 0) {
    playlist[existingIdx] = trackEntry
  } else {
    playlist.push(trackEntry)
  }

  await githubApi("contents/playlist.json", {
    method: "PUT",
    body: JSON.stringify({
      message: `feat(radio): update playlist \u2014 added "${title}"`,
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
}
