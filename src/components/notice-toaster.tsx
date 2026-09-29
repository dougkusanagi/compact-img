"use client";

import { useEffect } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "success" | "error" | "info";

export type Notice = {
  id: string;
  seq: number;
  tone: NoticeTone;
  message: string;
};

const TONE_STYLES: Record<NoticeTone, { container: string; icon: typeof Info }> = {
  success: { container: "border-success/30 text-foreground", icon: CircleCheck },
  error: { container: "border-destructive/30 text-foreground", icon: CircleAlert },
  info: { container: "border-foreground/20 text-foreground", icon: Info }
};

function NoticeItem({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  const { container, icon: Icon } = TONE_STYLES[notice.tone];
  const iconColor = notice.tone === "success" ? "text-success" : notice.tone === "error" ? "text-destructive" : "text-brand";

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(notice.id), notice.tone === "error" ? 9000 : 5000);
    return () => window.clearTimeout(timeout);
  }, [notice.id, notice.seq, notice.tone, onDismiss]);

  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "animate-enter pointer-events-auto flex items-start gap-3 rounded-md border bg-card px-4 py-3 text-sm shadow-lg shadow-foreground/10",
        container
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words leading-snug">{notice.message}</p>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => onDismiss(notice.id)}
        className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function NoticeToaster({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }) {
  if (!notices.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
