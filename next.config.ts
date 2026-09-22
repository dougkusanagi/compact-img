import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  outputFileTracingRoot: path.join(__dirname)
};

export default nextConfig;
