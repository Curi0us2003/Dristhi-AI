import type { NextConfig } from 'next';

// Static export: `next build` emits ./out, served by Firebase Hosting.
// /api/** is rewritten to the Cloud Function proxy in firebase.json.
const nextConfig: NextConfig = {
  output: 'export',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // next/image optimisation is unavailable in static exports (and for MJPEG/data URIs)
    unoptimized: true,
  },
};

export default nextConfig;
