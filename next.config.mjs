import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
      config.resolve = config.resolve || {}
      config.resolve.alias = {
        ...config.resolve.alias,
        '@webcontainer/api': resolve(__dirname, 'src/lib/webcontainer-stub.ts'),
      }
    }
    return config
  },
}

export default nextConfig
