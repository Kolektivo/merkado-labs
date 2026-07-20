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
      {
        protocol: "https",
        hostname: "kw-curacao.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.kw-curacao.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "moretrealestate.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.moretrealestate.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "monumentenzorg.cw",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.monumentenzorg.cw",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
