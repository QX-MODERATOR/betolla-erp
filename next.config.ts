import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BETOLLA_ISOLATED_TEST === '1' ? '.next-isolated' : '.next',
  allowedDevOrigins: ['192.168.2.17'],
};
export default nextConfig;
