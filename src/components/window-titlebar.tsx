"use client";

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { setCustomWindowTitlebar } from "@/lib/desktop-window";

export function WindowTitlebar({ isDesktop, onError }: { isDesktop: boolean; onError: (message: string) => void }) {
  const [maximized, setMaximized] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    const appWindow = getCurrentWindow();
    const update = async () => {
      try { const value = await appWindow.isMaximized(); if (!disposed) setMaximized(value); }
      catch { if (!disposed) onError("Não foi possível consultar o estado da janela."); }
    };
    void setCustomWindowTitlebar(true).catch(() => onError("Não foi possível ativar a barra personalizada da janela."));
    void update();
    void appWindow.onResized(() => void update()).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => onError("Não foi possível acompanhar o tamanho da janela."));
    return () => {
      disposed = true;
      unlisten?.();
      void setCustomWindowTitlebar(false).catch(() => onError("Não foi possível restaurar a barra nativa da janela."));
    };
  }, [isDesktop, onError]);

  async function control(action: "minimize" | "maximize" | "close") {
    if (!isDesktop || busy) return;
    setBusy(true);
    try {
      const appWindow = getCurrentWindow();
      if (action === "minimize") await appWindow.minimize();
      else if (action === "close") await appWindow.close();
      else { await appWindow.toggleMaximize(); setMaximized(await appWindow.isMaximized()); }
    } catch { onError("Não foi possível executar o comando da janela. Tente novamente."); }
    finally { setBusy(false); }
  }

  const tooltip = (label: string) => isDesktop ? label : `${label} · disponível no aplicativo desktop`;
  return (
    <header className="window-titlebar sticky top-0 z-[60] select-none border-b border-border bg-background">
      <div className="flex h-12 items-stretch">
        <div data-tauri-drag-region={isDesktop ? "" : undefined} className="flex min-w-0 flex-1 items-center gap-3 pl-4">
          <img src="/icon.svg" alt="" width={26} height={26} className="pointer-events-none h-[26px] w-[26px] shrink-0" />
          <h1 className="pointer-events-none truncate text-sm font-semibold tracking-[-.01em]">Compact Img</h1>
        </div>
        <div className="hidden items-center px-3 sm:flex"><LayoutSwitcher layout="beta" /></div>
        <div className="flex shrink-0 items-stretch" role="group" aria-label="Controles da janela">
          <button type="button" className="window-control" aria-label="Minimizar" title={tooltip("Minimizar")} disabled={!isDesktop || busy} onClick={() => void control("minimize")}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" /></svg></button>
          <button type="button" className="window-control" aria-label={maximized ? "Restaurar janela" : "Maximizar"} title={tooltip(maximized ? "Restaurar janela" : "Maximizar")} disabled={!isDesktop || busy} onClick={() => void control("maximize")}><svg viewBox="0 0 10 10" aria-hidden="true">{maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7Z" /> : <rect x=".55" y=".55" width="8.9" height="8.9" />}</svg></button>
          <button type="button" className="window-control window-close" aria-label="Fechar janela" title={tooltip("Fechar janela")} disabled={!isDesktop || busy} onClick={() => void control("close")}><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" /></svg></button>
        </div>
      </div>
      <div className="flex h-12 items-center justify-end border-t border-border px-4 sm:hidden"><LayoutSwitcher layout="beta" /></div>
    </header>
  );
}
