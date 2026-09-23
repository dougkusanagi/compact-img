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
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 text-sm font-semibold text-primary transition-colors hover:border-primary/35 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
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
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-6 backdrop-blur-[2px]"
        role="status"
        aria-live="polite"
      >
        <div className="flex max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-white bg-white/95 px-10 py-10 text-center shadow-2xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <UploadCloud className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Solte as imagens para adicionar</h2>
          <p className="mt-2 text-sm text-slate-500">JPG, PNG, WEBP e AVIF · Processamento local</p>
        </div>
      </div>
    );
  }

  return (
    <section
      {...getRootProps()}
      aria-busy={isImporting}
      className={cn(
        "group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-card text-center transition-all duration-300",
        compact ? "min-h-[232px] px-6 py-7 sm:px-10" : "min-h-72 px-6 py-10",
        isImporting || disabled
          ? "border-primary/60 bg-primary/[0.04] shadow-md shadow-primary/10"
          : dragActive
          ? "scale-[1.01] border-primary bg-primary/[0.06] shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/40 hover:shadow-md"
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
        compact ? "mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300" : "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300",
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
      <h2 className={cn("font-semibold tracking-tight", compact ? "text-lg" : "text-xl")}>
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
        className={cn("inline-flex items-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60", compact ? "mt-5 h-11 px-5 text-sm" : "mt-6 h-11 px-5 text-sm")}
      >
        {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <ImagePlus className="h-4 w-4" />}
        {isImporting ? "Carregando..." : "Escolher arquivos"}
      </button>
    </section>
  );
}
