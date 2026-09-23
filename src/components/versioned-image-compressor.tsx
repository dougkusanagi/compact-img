"use client";

import { usePathname } from "next/navigation";
import { ImageCompressorApp } from "@/components/image-compressor-app";

export function VersionedImageCompressor() {
  const pathname = usePathname();
  const currentPath = pathname?.replace(/\/+$/, "") || "/";
  const variant = currentPath === "/beta" ? "beta" : "current";

  if (currentPath !== "/" && currentPath !== "/beta") {
    return null;
  }

  return <ImageCompressorApp variant={variant} />;
}
