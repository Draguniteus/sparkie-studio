import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 30

const DO_TOKEN = process.env.DIGITALOCEAN_API_KEY ?? process.env.DO_API_TOKEN ?? ''
const APP_ID   = process.env.DO_APP_ID ?? 'fb3d58ac-f1b5-4e65-89b5-c12834d8119a'
const DO_BASE  = 'https://api.digitalocean.com/v2'

function doHeaders() {
  return {
    Authorization: `Bearer ${DO_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

interface DODeployment {
  id: string
  phase: string
  phase_last_updated_at: string
  progress: {
    success_steps: number
    total_steps: number
    error_steps: number
    pending_steps: number
    running_steps: number
  }
  cause: string
  cloned_from?: string
}

interface LogResponse {
  historic_urls: string[]
  live_url: string
}

// Parse common build failure patterns
function diagnoseBuildLog(log: string): {
  errorType: string
  details: string
  suggestedFix: string
} {
  // TypeScript compilation errors
  const tsMatch = log.match(/error TS\d+: (.+?)(?:\n|$)/i)
  if (tsMatch) {
    const msg = tsMatch[1]
    if (msg.includes("';'") || msg.includes('Expected a semicolon')) {
      return {
        errorType: 'TypeScript: Expected semicolon',
        details: msg,
        suggestedFix: 'Likely unescaped backtick inside a TS template literal. Escape as \\` in the affected string.',
      }
    }
    if (msg.includes('ReadableStream') || msg.includes('controller')) {
      return {
        errorType: 'TypeScript: ReadableStream async pattern',
        details: msg,
        suggestedFix: 'Move all async logic inside start() callback. Never use external let controller.',
      }
    }
    return {
      errorType: 'TypeScript compilation error',
      details: msg,
      suggestedFix: 'Check the file and line number indicated in the log.',
    }
  }

  // npm install failures
  if (log.includes('npm ERR!') || log.includes('npm error')) {
    const npmMatch = log.match(/npm ERR! (.+?)(?:\n|$)/)
    return {
      errorType: 'npm install failure',
      details: npmMatch ? npmMatch[1] : 'npm install failed',
      suggestedFix: 'Check package.json for invalid package names, version conflicts, or missing peer deps.',
    }
  }

  // Build timeout
  if (log.includes('Build timed out') || log.includes('timeout')) {
    return {
      errorType: 'Build timeout',
      details: 'Build exceeded maximum duration',
      suggestedFix: 'Optimize build: remove unused dependencies, check for infinite loops in build scripts.',
    }
  }

  // Out of memory
  if (log.includes('JavaScript heap out of memory') || log.includes('ENOMEM')) {
    return {
      errorType: 'Out of memory',
      details: 'Node.js ran out of heap space during build',
      suggestedFix: 'Add NODE_OPTIONS=--max-old-space-size=4096 to DO build env vars.',
    }
  }

  return {
    errorType: 'Unknown build failure',
    details: log.slice(-500), // last 500 chars
    suggestedFix: 'Review the full build log for error details.',
  }
}

export async function GET(req: Request) {
  // Require auth OR the cron secret
  const url = new URL(req.url)
  const cronSecret = req.headers.get('x-cron-secret')
  const validCron = cronSecret === process.env.AGENT_CRON_SECRET

  if (!validCron) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!DO_TOKEN) {
    return NextResponse.json({ error: 'DO_API_TOKEN not configured' }, { status: 500 })
  }

  try {
    // 1. Get recent deployments
    const deploysRes = await fetch(
      `${DO_BASE}/apps/${APP_ID}/deployments?per_page=5`,
      { headers: doHeaders() }
    )
    if (!deploysRes.ok) {
      return NextResponse.json(
        { error: `DO API error: ${deploysRes.status}` },
        { status: 502 }
      )
    }

    const deploysData = await deploysRes.json() as { deployments: DODeployment[] }
    const deployments = deploysData.deployments ?? []

    // 2. Find the most recent deployment
    const latest = deployments[0]
    if (!latest) {
      return NextResponse.json({ status: 'no_deployments', deployments: [] })
    }

    // 3. Check if it failed
    const isFailed = latest.phase === 'ERROR' || latest.phase === 'FAILED'
    const isActive = ['BUILDING', 'DEPLOYING', 'PENDING_DEPLOY', 'QUEUED'].includes(latest.phase)
    const isActive2 = latest.progress?.running_steps > 0

    let buildLog = ''
    let diagnosis = null

    if (isFailed) {
      // 4. Fetch build logs
      const logRes = await fetch(
        `${DO_BASE}/apps/${APP_ID}/deployments/${latest.id}/components/sparkie-studio/logs?type=BUILD`,
        { headers: doHeaders() }
      )

      if (logRes.ok) {
        const logData = await logRes.json() as LogResponse
        const logUrl = logData.historic_urls?.[0]
        if (logUrl) {
          const rawLog = await fetch(logUrl)
          buildLog = await rawLog.text()
          buildLog = buildLog.slice(-3000) // last 3000 chars for analysis
          diagnosis = diagnoseBuildLog(buildLog)
        }
      }
    }

    return NextResponse.json({
      appId: APP_ID,
      latest: {
        id: latest.id,
        phase: latest.phase,
        updatedAt: latest.phase_last_updated_at,
        cause: latest.cause,
        progress: latest.progress,
      },
      status: isFailed ? 'failed' : isActive || isActive2 ? 'building' : 'healthy',
      failed: isFailed,
      buildLog: isFailed ? buildLog : null,
      diagnosis: isFailed ? diagnosis : null,
      recentDeployments: deployments.slice(0, 5).map((d: DODeployment) => ({
        id: d.id,
        phase: d.phase,
        cause: d.cause,
        updatedAt: d.phase_last_updated_at,
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST — trigger a new deployment (Michael only)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { email?: string } | undefined
  if (!user?.email || !['draguniteus@gmail.com', 'michaelthearchangel2024@gmail.com'].includes(user.email)) {
    return NextResponse.json({ error: 'Unauthorized — owner only' }, { status: 403 })
  }

  if (!DO_TOKEN) {
    return NextResponse.json({ error: 'DO_API_TOKEN not configured' }, { status: 500 })
  }

  const res = await fetch(`${DO_BASE}/apps/${APP_ID}/deployments`, {
    method: 'POST',
    headers: doHeaders(),
    body: JSON.stringify({ force_build: true }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Deploy trigger failed: ${res.status}`, detail: text }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json({ ok: true, deployment: data.deployment })
}
