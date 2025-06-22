/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Configuração para permitir API routes
  experimental: {
    publicDirectory: 'public',
  },
}

module.exports = nextConfig