import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: "./",
  outputFileTracingRoot: path.join(__dirname)
};

export default nextConfig;
