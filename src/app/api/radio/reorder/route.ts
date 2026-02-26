import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
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
    // ── Auth: admin only ────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden — reorder is admin-only" }, { status: 403 })
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 })
    }

    // ── Parse body: { order: string[] } — array of track IDs in new order ──
    const body = await req.json()
    const order: string[] = body?.order
    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "order must be a non-empty array of track IDs" }, { status: 400 })
    }

    // ── Fetch current playlist.json ─────────────────────────────────────────
    const playlistFile = await githubApi(GITHUB_TOKEN, `contents/playlist.json?ref=${BRANCH}`)
    const playlistSha: string = playlistFile.sha
    const decoded = Buffer.from(playlistFile.content.trim(), "base64").toString("utf-8")
    const playlist: Array<{ id: string; title: string; artist?: string; url: string; coverUrl?: string }> = JSON.parse(decoded)

    // ── Re-sort playlist according to the requested order ───────────────────
    // Tracks not in order array are appended at the end (handles race conditions)
    const byId = new Map(playlist.map(t => [t.id, t]))
    const reordered = [
      ...order.map(id => byId.get(id)).filter(Boolean) as typeof playlist,
      ...playlist.filter(t => !order.includes(t.id)),
    ]

    // ── Commit new playlist.json ────────────────────────────────────────────
    await githubApi(GITHUB_TOKEN, "contents/playlist.json", {
      method: "PUT",
      body: JSON.stringify({
        message: "feat(radio): reorder playlist",
        content: Buffer.from(JSON.stringify(reordered, null, 2) + "\n").toString("base64"),
        branch: BRANCH,
        sha: playlistSha,
      }),
    })

    return NextResponse.json({ success: true, count: reordered.length })
  } catch (err) {
    console.error("[radio/reorder] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}
