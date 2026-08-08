/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Disable React Strict Mode to prevent useEffect double-invoke in dev
  // (which caused ProcessPanel to submit jobs twice)
  reactStrictMode: false,
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
