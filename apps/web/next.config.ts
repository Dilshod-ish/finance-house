import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The design system and the report structures are workspace TypeScript.
  transpilePackages: ['@fincore/ui', '@fincore/reports', '@fincore/shared'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default config;
