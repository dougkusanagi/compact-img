"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ImageCompressorApp } from "@/components/image-compressor-app";

export function VersionedImageCompressor() {
  const pathname = usePathname();
  const router = useRouter();
  const initialized = useRef(false);
  const restoringBeta = useRef(false);
  const layout = pathname?.replace(/\/$/, "") === "/beta" ? "beta" : "classic";

  useEffect(() => {
    if (!pathname) return;
    if (!initialized.current) {
      initialized.current = true;
      try {
        restoringBeta.current = pathname === "/" && localStorage.getItem("compact-img-layout") === "beta";
      } catch { /* Storage may be unavailable; the current route remains usable. */ }
    }
    if (restoringBeta.current && layout !== "beta") {
      router.replace("/beta/");
      return;
    }
    restoringBeta.current = false;
    try {
      localStorage.setItem("compact-img-layout", layout);
    } catch { /* Layout switching still works without persistent storage. */ }
  }, [layout, pathname, router]);

  return <ImageCompressorApp layout={layout} />;
}
