import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@aiapi/contracts', '@aiapi/core'],
}

export default nextConfig
