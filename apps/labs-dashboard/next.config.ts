import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.remax-abc.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.realestate-curacao.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "realestate-curacao.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
