/** @type {import('next').NextConfig} */
const nextConfig = {
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
