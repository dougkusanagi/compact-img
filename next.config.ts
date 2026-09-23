import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.COMPACT_IMG_DIST_DIR ?? ".next",
  output: "export",
  trailingSlash: true,
  outputFileTracingRoot: path.join(__dirname)
};

export default nextConfig;
