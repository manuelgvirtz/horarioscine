/** @type {import('next').NextConfig} */
const nextConfig = {
  // Treat better-sqlite3 as an external native module (not bundled by webpack)
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
