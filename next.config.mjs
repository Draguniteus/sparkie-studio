/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin'  },
        ],
      },
    ]
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // On the server build, replace browser-only packages with stubs
      config.resolve = config.resolve || {}
      config.resolve.alias = {
        ...config.resolve.alias,
        '@webcontainer/api': require('path').resolve('./src/lib/webcontainer-stub.ts'),
      }
    }
    return config
  },
}

export default nextConfig
