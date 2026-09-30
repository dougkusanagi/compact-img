"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function LayoutSwitcher({ layout }: { layout: "classic" | "beta" }) {
  return (
    <nav aria-label="Layout da interface" className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/70 p-1 text-xs font-medium">
      <Link href="/" aria-current={layout === "classic" ? "page" : undefined}
        className={cn("rounded-md px-2 py-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3", layout === "classic" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
        Atual
      </Link>
      <Link href="/beta/" aria-current={layout === "beta" ? "page" : undefined}
        className={cn("flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3", layout === "beta" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
        Novo <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-strong">Beta</span>
      </Link>
    </nav>
  );
}
