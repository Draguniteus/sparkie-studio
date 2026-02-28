/**
 * Next.js Instrumentation Hook — runs once on server startup (nodejs runtime only).
 * Boots the Sparkie background heartbeat scheduler.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const host = process.env.APP_DOMAIN
    ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '')
    ?? 'localhost:3000'
  const baseUrl = `${proto}://${host}`

  const { startScheduler } = await import('@/lib/scheduler')
  startScheduler(baseUrl)
}
