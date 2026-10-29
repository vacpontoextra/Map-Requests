/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lint is not part of this project's toolchain; don't fail production builds on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
