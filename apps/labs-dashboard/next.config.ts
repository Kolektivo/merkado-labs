import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "caribbeanhousehunt.com",
        pathname: "/map-assets/property-images/**",
      },
    ],
  },
};

export default nextConfig;
