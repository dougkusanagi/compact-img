"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDropzone } from "react-dropzone";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Folder, ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, isAcceptedImage } from "@/lib/image-utils";
import {
  isAcceptedImagePath,
  isDesktopApp,
  loadImagesFromPaths,
  selectDesktopImages,
  selectDesktopFolderImages
} from "@/lib/desktop";
import type { SelectedImage } from "@/lib/image-types";

type ImageDropzoneProps = {
  onFiles: (files: SelectedImage[]) => void;
  onInvalidFiles: (names: string[]) => void;
  isDesktop: boolean;
  compact?: boolean;
  appearance?: "default" | "premium";
  mode?: "dropzone" | "button" | "overlay";
  disabled?: boolean;
  enableNativeDragDrop?: boolean;
  enableLocalDragDrop?: boolean;
};

export function ImageDropzone({
  onFiles,
  onInvalidFiles,
  isDesktop,
  compact = false,
  appearance = "default",
  mode = "dropzone",
  disabled = false,
  enableNativeDragDrop = true,
  enableLocalDragDrop = true
}: ImageDropzoneProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isNativeDragActive, setIsNativeDragActive] = useState(false);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const dragDepthRef = useRef(0);
  const nativeDragActiveRef = useRef(false);
  const lastNativeDropAtRef = useRef(-Infinity);
  const isImporting = importingCount > 0;

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: { file: File }[]) => {
      if (isDesktop || isDesktopApp()) {
        return;
      }

      if (rejectedFiles.length) {
        onInvalidFiles(rejectedFiles.map(({ file }) => file.name));
      }

      if (!acceptedFiles.length) {
        return;
      }

      setImportingCount(acceptedFiles.length);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      try {
        onFiles(acceptedFiles.map((file) => ({ file })));
      } finally {
        setImportingCount(0);
      }
    },
    [isDesktop, onFiles, onInvalidFiles]
  );

  useEffect(() => {
    if (!enableNativeDragDrop || mode === "button" || !isDesktopApp()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(async ({ payload }) => {
        if (disposed) {
          return;
        }
        if (payload.type === "enter" || payload.type === "over") {
          nativeDragActiveRef.current = true;
          dragDepthRef.current = 0;
          setIsGlobalDragActive(false);
          setIsNativeDragActive(!disabled);
          return;
        }

        if (payload.type === "drop") {
          lastNativeDropAtRef.current = performance.now();
        }
        nativeDragActiveRef.current = false;
        setIsNativeDragActive(false);
        if (payload.type !== "drop" || disabled) {
          return;
        }

        const validPaths = payload.paths.filter(isAcceptedImagePath);
        const invalidPaths = payload.paths.filter((path) => !isAcceptedImagePath(path));

        if (invalidPaths.length) {
          onInvalidFiles(invalidPaths.map((path) => path.split(/[\\/]/).pop() ?? path));
        }

        try {
          if (validPaths.length) {
            setImportingCount(validPaths.length);
            const files = await loadImagesFromPaths(validPaths);
            onFiles(files);
          }
        } catch {
          onInvalidFiles(validPaths.map((path) => path.split(/[\\/]/).pop() ?? path));
        } finally {
          setImportingCount(0);
        }
      })
      .then((stopListening) => {
        if (disposed) {
          stopListening();
        } else {
          unlisten = stopListening;
        }
      })
      .catch((error) => {
        console.error("Não foi possível acompanhar o arraste nativo:", error);
      });

    return () => {
      disposed = true;
      nativeDragActiveRef.current = false;
      unlisten?.();
    };
  }, [disabled, enableNativeDragDrop, mode, onFiles, onInvalidFiles]);

  useEffect(() => {
    if (mode !== "overlay") {
      return;
    }

    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsGlobalDragActive(false);
    };

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      if (disabled || nativeDragActiveRef.current) {
        return;
      }

      dragDepthRef.current += 1;
      setIsGlobalDragActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      if (disabled || nativeDragActiveRef.current) {
        return;
      }

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsGlobalDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      if (disabled || nativeDragActiveRef.current) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsGlobalDragActive(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      resetDragState();
      nativeDragActiveRef.current = false;
      setIsNativeDragActive(false);
      if (disabled || performance.now() - lastNativeDropAtRef.current < 500) {
        return;
      }

      const files = Array.from(event.dataTransfer?.files ?? []);
      const acceptedFiles = files.filter(isAcceptedImage);
      const rejectedFiles = files.filter((file) => !isAcceptedImage(file));

      if (rejectedFiles.length) {
        onInvalidFiles(rejectedFiles.map((file) => file.name));
      }

      if (!acceptedFiles.length) {
        return;
      }

      const importFiles = () => {
        if (performance.now() - lastNativeDropAtRef.current < 500) {
          return;
        }
        setImportingCount(acceptedFiles.length);
        try {
          onFiles(acceptedFiles.map((file) => ({ file })));
        } finally {
          setImportingCount(0);
        }
      };

      // O evento nativo pode chegar logo após o drop do WebKitGTK; dê preferência aos caminhos nativos.
      if (isDesktop) {
        window.setTimeout(importFiles, 150);
      } else {
        window.requestAnimationFrame(importFiles);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      resetDragState();
    };
  }, [disabled, isDesktop, mode, onFiles, onInvalidFiles]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_IMAGE_TYPES,
    multiple: true,
    noClick: true,
    noDrag: !enableLocalDragDrop || isDesktop,
    disabled: isImporting || disabled,
    onDrop
  });

  const chooseFiles = useCallback(async () => {
    if (isImporting || disabled) {
      return;
    }

    if (!isDesktop) {
      open();
      return;
    }

    try {
      const files = await selectDesktopImages();
      if (files.length) {
        onFiles(files);
      }
    } catch {
      onInvalidFiles(["Nao foi possivel abrir os arquivos selecionados."]);
    }
  }, [disabled, isDesktop, isImporting, onFiles, onInvalidFiles, open]);

  const chooseFolder = async () => {
    if (disabled || isImporting) return;
    if (!isDesktop) { folderInputRef.current?.click(); return; }
    setImportingCount(1);
    try { const files = await selectDesktopFolderImages(); if (files.length) onFiles(files); else onInvalidFiles(["Nenhuma imagem encontrada na pasta."]); }
    catch { onInvalidFiles(["Não foi possível abrir a pasta selecionada."]); }
    finally { setImportingCount(0); }
  };
  const folderInput = <input ref={folderInputRef} type="file" multiple hidden aria-label="Escolher pasta de imagens" {...{ webkitdirectory: "" }} onChange={(event) => {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter(isAcceptedImage);
    const rejected = files.filter((file) => !isAcceptedImage(file));
    if (accepted.length) onFiles(accepted.map((file) => ({ file })));
    if (rejected.length) onInvalidFiles(rejected.map((file) => file.name));
    event.target.value = "";
  }} />;
  const folderButton = <button type="button" disabled={disabled || isImporting} onClick={() => void chooseFolder()}
    className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><Folder className="h-4 w-4" />Escolher pasta</button>;

  const dragActive = isDragActive || isNativeDragActive;
  const isOverlayVisible = mode === "overlay" && (isGlobalDragActive || isNativeDragActive);

  // Desfoca o app por baixo do overlay. backdrop-filter não funciona no WebKitGTK do app desktop.
  useEffect(() => {
    if (!isOverlayVisible) {
      return;
    }
    const root = document.documentElement;
    root.dataset.dropOverlay = "true";
    return () => {
      delete root.dataset.dropOverlay;
    };
  }, [isOverlayVisible]);

  if (mode === "button") {
    return (
      <div {...getRootProps()} className="flex shrink-0 flex-wrap items-center gap-2">
        {folderInput}
        <input {...getInputProps()} />
        <button
          type="button"
          onClick={() => void chooseFiles()}
          disabled={isImporting || disabled}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-foreground/20 bg-card px-3.5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
        >
          {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <ImagePlus className="h-4 w-4" />}
          {isImporting ? "Carregando..." : "Adicionar imagens"}
        </button>
        {folderButton}
      </div>
    );
  }

  if (mode === "overlay") {
    if (!isGlobalDragActive && !isNativeDragActive) {
      return null;
    }

    // Portal: ancestrais animados com transform prenderiam o overlay fixo à coluna do conteúdo.
    return createPortal(
      <div
        className="animate-drop-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/30 p-3 sm:p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-brand/60 bg-card/30 px-5 text-center">
          <div className="animate-enter flex flex-col items-center">
            <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <UploadCloud className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Solte as imagens aqui</h2>
            <p className="mt-2 text-sm text-muted-foreground">JPG, PNG, WebP ou AVIF · Processamento local</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <section
      {...getRootProps()}
      aria-busy={isImporting}
      className={cn(
        "dropzone-surface group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed bg-card px-6 py-10 text-center transition-[border-color,background-color] duration-200 sm:px-10",
        compact ? "min-h-[360px] lg:min-h-[580px]" : "min-h-80",
        appearance === "premium" && "min-h-[480px] rounded-[20px] bg-card/55 sm:min-h-[520px]",
        isImporting || disabled
          ? "border-brand/50"
          : dragActive
          ? "border-brand"
          : "border-foreground/25 hover:border-brand/60"
      )}
    >
      <input {...getInputProps()} />
      {folderInput}
      <div
        className={cn(
          "dropzone-icon mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-brand/15 bg-brand-soft text-brand-strong sm:h-16 sm:w-16",
          dragActive && "bg-brand text-brand-foreground"
        )}
      >
        {isImporting ? (
          <LoaderCircle className="h-8 w-8 loading-spinner" />
        ) : dragActive ? (
          <ImagePlus className="h-8 w-8" />
        ) : (
          <UploadCloud className="h-8 w-8" />
        )}
      </div>
      <h2 className={cn("text-[24px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[27px]", appearance === "premium" && "max-w-[320px] text-[30px] sm:text-[34px]")}>
        {isImporting
          ? `Carregando ${importingCount} ${importingCount === 1 ? "imagem" : "imagens"}...`
          : dragActive
            ? "Pode soltar suas imagens"
            : appearance === "premium" ? "Arraste suas fotos para começar" : "Solte suas imagens aqui"}
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        {disabled
          ? "Aguarde a conclusão do processamento para adicionar arquivos."
          : isImporting
            ? "Preparando os arquivos para exibir na lista. Isso pode levar alguns segundos."
            : appearance === "premium" ? "Compacte dezenas de imagens de uma vez. Tudo acontece neste computador, nada é enviado." : "Arraste arquivos para esta área ou escolha no seu dispositivo."}
      </p>
      <button
        type="button"
        onClick={chooseFiles}
        disabled={isImporting || disabled}
        className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
      >
        {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <ImagePlus className="h-4 w-4" />}
        {isImporting ? "Carregando..." : "Escolher arquivos"}
      </button>
      <div className="mt-3">{folderButton}</div>
      <p className="mt-3 text-xs text-muted-foreground">Ou cole uma imagem com Ctrl V</p>
      <div className="absolute inset-x-6 bottom-5 hidden items-center justify-between border-t border-foreground/10 pt-4 text-[11px] font-medium text-muted-foreground sm:flex sm:inset-x-8">
        <span>JPG · PNG · WebP · AVIF</span>
        <span>Processamento local</span>
      </div>
    </section>
  );
}
