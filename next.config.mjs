/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint errors shown in terminal but never block the production build
    ignoreDuringBuilds: true,
  },
  // Instrumentation is auto-registered via src/instrumentation.ts in Next.js 14+
  // (instrumentationHook config key was removed in Next.js 14)

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.pollinations.ai' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin'  },
        ],
      },
    ]
  },
}

export default nextConfig
