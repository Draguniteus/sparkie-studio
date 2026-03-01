/** @type {import('next').NextConfig} */
const nextConfig = {
  // Instrumentation is auto-registered via src/instrumentation.ts in Next.js 14+
  // (instrumentationHook config key was removed in Next.js 14)

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // credentialless allows CDN scripts/styles in preview iframes while still
          // enabling SharedArrayBuffer isolation required by WebContainers
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin'  },
        ],
      },
    ]
  },
}

export default nextConfig
