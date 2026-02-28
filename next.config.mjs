/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable the Next.js instrumentation hook (server startup lifecycle)
  // Required to register the background heartbeat scheduler
  instrumentationHook: true,

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
