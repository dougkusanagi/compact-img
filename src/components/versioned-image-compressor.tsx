"use client";

import { usePathname } from "next/navigation";
import { ImageCompressorApp } from "@/components/image-compressor-app";

export function VersionedImageCompressor() {
  const pathname = usePathname();
  return <ImageCompressorApp layout={pathname?.replace(/\/$/, "") === "/beta" ? "beta" : "classic"} />;
}
