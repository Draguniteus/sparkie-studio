/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Required for DigitalOcean App Platform
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
