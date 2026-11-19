import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/removed/accounts", destination: "/accounts", permanent: false },
      { source: "/removed/accounts/:path*", destination: "/accounts", permanent: false },
      { source: "/removed", destination: "/apps", permanent: false },
      { source: "/removed/:path*", destination: "/apps", permanent: false },
      { source: "/watchlist", destination: "/apps", permanent: false },
      { source: "/compare", destination: "/apps", permanent: false },
      { source: "/explorer", destination: "/apps", permanent: false },
      { source: "/charts", destination: "/apps", permanent: false },
      { source: "/updates", destination: "/apps", permanent: false },
      { source: "/releases", destination: "/apps", permanent: false },
      { source: "/keywords", destination: "/apps", permanent: false },
    ];
  },
  serverExternalPackages: ["google-play-scraper"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
