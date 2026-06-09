import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Externalize Playwright from the server bundle — it's called from a separate script/process
  serverExternalPackages: ['playwright', 'playwright-core'],
}

export default nextConfig
