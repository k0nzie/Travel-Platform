import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this Next.js server. /api and /uploads are forwarded to the
 * NestJS backend, so the backend's httpOnly cookies are first-party and "just work" (ACC-19).
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
