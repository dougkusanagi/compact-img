"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ConflictPolicy } from "@/lib/image-types";
export type ConflictDecision = Exclude<ConflictPolicy, "ask"> | "cancel";
type Request = { name: string; resolve: (decision: ConflictDecision) => void };
export function useFileConflicts() {
  const requests = useRef<Request[]>([]);
  const trigger = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<Request>();
  const resolveConflict = useCallback((name: string) => new Promise<ConflictDecision>((resolve) => {
    if (!requests.current.length) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = { name, resolve };
    requests.current.push(request);
    if (requests.current.length === 1) setActive(request);
  }), []);
  const settle = (decision: ConflictDecision) => {
    requests.current.shift()?.resolve(decision);
    setActive(requests.current[0]);
  };
  useEffect(() => () => { requests.current.splice(0).forEach((request) => request.resolve("cancel")); }, []);
  const dialog = <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) settle("cancel"); }}>
    <DialogContent className="max-w-[480px]" aria-describedby="file-conflict-description" onCloseAutoFocus={(event) => {
      event.preventDefault();
      const restore = () => {
        if (trigger.current?.isConnected) trigger.current.focus();
        else Array.from(document.querySelectorAll<HTMLElement>("[role=dialog][data-state=open] button:not([disabled]), header a[aria-current=page]"))
          .find((element) => element.getClientRects().length > 0)?.focus();
      };
      restore();
      // A completed/skipped row may remove its button in a deferred queue update.
      requestAnimationFrame(() => { if (document.activeElement === document.body) restore(); });
    }}>
      <DialogTitle>O arquivo já existe</DialogTitle>
      <p id="file-conflict-description" className="break-all text-sm text-muted-foreground">{active?.name}</p>
      <div className="grid gap-2">
        <Button onClick={() => settle("rename")}>Manter os dois</Button>
        <Button variant="outline" onClick={() => settle("overwrite")}>Substituir o arquivo existente</Button>
        <Button variant="outline" onClick={() => settle("skip")}>Pular este arquivo</Button>
        <Button variant="ghost" onClick={() => settle("cancel")}>Cancelar salvamento</Button>
      </div>
    </DialogContent>
  </Dialog>;
  return { resolveConflict, dialog };
}
