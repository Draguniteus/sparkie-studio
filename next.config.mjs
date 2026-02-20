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
      // Don't bundle WC + xterm on server — browser-only packages
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        '@webcontainer/api',
        '@xterm/xterm',
        '@xterm/addon-fit',
        '@xterm/addon-web-links',
      ]
    }
    return config
  },
}

export default nextConfig
