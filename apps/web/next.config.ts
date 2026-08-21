import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@aiapi/contracts', '@aiapi/core'],
  env: {
    NEXT_PUBLIC_GATEWAY_BASE_URL: 'https://70-36-125-65.sslip.io',
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
