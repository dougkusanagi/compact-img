"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, isAcceptedImage } from "@/lib/image-utils";
import {
  isAcceptedImagePath,
  isDesktopApp,
  loadImagesFromPaths,
  selectDesktopImages
} from "@/lib/desktop";
import type { SelectedImage } from "@/lib/image-types";

type ImageDropzoneProps = {
  onFiles: (files: SelectedImage[]) => void;
  onInvalidFiles: (names: string[]) => void;
  isDesktop: boolean;
  compact?: boolean;
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
  mode = "dropzone",
  disabled = false,
  enableNativeDragDrop = true,
  enableLocalDragDrop = true
}: ImageDropzoneProps) {
  const [isNativeDragActive, setIsNativeDragActive] = useState(false);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const dragDepthRef = useRef(0);
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

    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setIsNativeDragActive(!disabled);
          return;
        }

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
        unlisten = stopListening;
      });

    return () => unlisten?.();
  }, [disabled, enableNativeDragDrop, mode, onFiles, onInvalidFiles]);

  useEffect(() => {
    if (mode !== "overlay") {
      return;
    }

    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const isDesktopEnvironment = () => isDesktop || isDesktopApp();
    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsGlobalDragActive(false);
    };

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      if (disabled || isDesktopEnvironment()) {
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
      if (disabled || isDesktopEnvironment()) {
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
      if (disabled || isDesktopEnvironment()) {
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
      if (disabled || isDesktopEnvironment()) {
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

      setImportingCount(acceptedFiles.length);
      window.requestAnimationFrame(() => {
        try {
          onFiles(acceptedFiles.map((file) => ({ file })));
        } finally {
          setImportingCount(0);
        }
      });
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

  const dragActive = isDragActive || isNativeDragActive;

  if (mode === "button") {
    return (
      <div {...getRootProps()} className="shrink-0">
        <input {...getInputProps()} />
        <button
          type="button"
          onClick={() => void chooseFiles()}
          disabled={isImporting || disabled}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 text-sm font-semibold text-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
        >
          {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <ImagePlus className="h-4 w-4" />}
          {isImporting ? "Carregando..." : "Adicionar imagens"}
        </button>
      </div>
    );
  }

  if (mode === "overlay") {
    if (!isGlobalDragActive && !isNativeDragActive) {
      return null;
    }

    return (
      <div
        className="animate-drop-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-5"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-[20px] border-[5px] border-dashed border-primary px-5 text-center shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)] sm:rounded-[28px]">
          <div className="animate-enter flex flex-col items-center text-white drop-shadow-[0_2px_10px_rgba(15,23,42,0.28)]">
            <UploadCloud className="mb-4 h-12 w-12 text-primary" strokeWidth={1.6} aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Solte as imagens aqui</h2>
            <p className="mt-2 text-sm font-medium text-white/85 sm:text-base">JPG, PNG, WebP ou AVIF</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      {...getRootProps()}
      aria-busy={isImporting}
      className={cn(
        "dropzone-surface group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-card text-center transition-all duration-300 hover:-translate-y-0.5",
        compact ? "min-h-[290px] px-6 py-8 sm:px-10" : "min-h-80 px-6 py-10",
        isImporting || disabled
          ? "border-primary/60 bg-primary/[0.04] shadow-lg shadow-primary/10"
          : dragActive
          ? "scale-[1.01] border-primary bg-primary/[0.06] shadow-xl shadow-primary/15"
          : "border-border hover:border-primary/40 hover:shadow-lg"
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
        compact ? "dropzone-icon mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300" : "dropzone-icon mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-all duration-300",
          isImporting ? "scale-105" : dragActive ? "scale-110 rotate-3" : "group-hover:-translate-y-1"
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
      <h2 className={cn("font-bold tracking-tight", compact ? "text-xl" : "text-xl")}>
        {isImporting
          ? `Carregando ${importingCount} ${importingCount === 1 ? "imagem" : "imagens"}...`
          : dragActive
            ? "Pode soltar suas imagens"
            : "Solte imagens aqui"}
      </h2>
      <p className={cn("mt-2 max-w-lg leading-relaxed text-muted-foreground", compact ? "text-sm" : "text-sm")}>
        {disabled
          ? "Aguarde a conclusão do processamento para adicionar arquivos."
          : isImporting
            ? "Preparando os arquivos para exibir na lista. Isso pode levar alguns segundos."
            : "JPG, PNG, WEBP e AVIF · Processamento local"}
      </p>
      <button
        type="button"
        onClick={chooseFiles}
        disabled={isImporting || disabled}
        className={cn("animate-shimmer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:180%_100%] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-[background-position,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_0] hover:shadow-xl hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60", compact ? "mt-5 h-11 px-5 text-sm" : "mt-6 h-11 px-5 text-sm")}
      >
        {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <ImagePlus className="h-4 w-4" />}
        {isImporting ? "Carregando..." : "Escolher arquivos"}
      </button>
    </section>
  );
}
