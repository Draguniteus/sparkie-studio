// Server-side stub for @webcontainer/api
// This file is used during Next.js build to satisfy webpack's module resolution.
// The real implementation runs client-side only.
export const WebContainer = {
  boot: async () => { throw new Error('WebContainer is browser-only') }
}
