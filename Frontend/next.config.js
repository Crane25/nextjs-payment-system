/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output configuration for static hosting
  output: 'standalone',
  
  // Disable image optimization for static export (optional)
  images: {
    domains: ['localhost'],
    unoptimized: true
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ];
  },
  
  // Environment variables validation
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // Experimental features
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  
  // Disable x-powered-by header
  poweredByHeader: false,
  
  // Compress responses
  compress: true,
  
  // Production redirects
  async redirects() {
    return [];
  },
  
  // Trailing slash configuration
  trailingSlash: false,
  
  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },
  
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  }
}

module.exports = nextConfig 