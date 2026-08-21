import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  devIndicators: {
    position: "bottom-right",
  },
  images: {
    remotePatterns: [],
  },
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: false },
      { source: "/settings", destination: "/", permanent: false },
      { source: "/originate/payers", destination: "/originate", permanent: false },
      { source: "/originate/audit", destination: "/originate", permanent: false },
      { source: "/originate/readiness", destination: "/", permanent: false },
      { source: "/pay/home", destination: "/pay", permanent: false },
      { source: "/pay/payments", destination: "/pay", permanent: false },
      { source: "/pay/history", destination: "/pay", permanent: false },
      { source: "/pay/method", destination: "/pay", permanent: false },
      { source: "/pay/now", destination: "/pay", permanent: false },
      { source: "/pay/notice", destination: "/pay", permanent: false },
      { source: "/payouts", destination: "/originate", permanent: false },
      { source: "/account/payouts", destination: "/originate", permanent: false },
      { source: "/account/settings", destination: "/account/apps", permanent: false },
    ];
  },
};

export default nextConfig;
