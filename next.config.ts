import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BETOLLA_ISOLATED_TEST === '1' ? '.next-isolated' : '.next',
};

export default nextConfig;
