"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileImage, ImagePlus, LoaderCircle, MousePointerClick, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-utils";
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
};

export function ImageDropzone({ onFiles, onInvalidFiles, isDesktop, compact = false }: ImageDropzoneProps) {
  const [isNativeDragActive, setIsNativeDragActive] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const isImporting = importingCount > 0;

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: { file: File }[]) => {
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
    [onFiles, onInvalidFiles]
  );

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }

    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setIsNativeDragActive(true);
          return;
        }

        setIsNativeDragActive(false);
        if (payload.type !== "drop") {
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
  }, [onFiles, onInvalidFiles]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_IMAGE_TYPES,
    multiple: true,
    noClick: true,
    disabled: isImporting,
    onDrop
  });

  const chooseFiles = useCallback(async () => {
    if (isImporting) {
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
  }, [isDesktop, isImporting, onFiles, onInvalidFiles, open]);

  const dragActive = isDragActive || isNativeDragActive;

  return (
    <section
      {...getRootProps()}
      aria-busy={isImporting}
      className={cn(
        "subtle-grid group relative flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-card text-center transition-all duration-300",
        compact ? "min-h-44 px-4 py-6" : "min-h-72 px-6 py-10",
        isImporting
          ? "border-primary/60 bg-primary/[0.04] shadow-md shadow-primary/10"
          : dragActive
          ? "scale-[1.01] border-primary bg-primary/[0.06] shadow-lg shadow-primary/10"
          : "border-border hover:border-primary/40 hover:shadow-md"
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
        compact ? "mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300" : "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300",
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
      <h2 className={cn("font-bold tracking-tight", compact ? "text-base" : "text-xl")}>
        {isImporting
          ? `Carregando ${importingCount} ${importingCount === 1 ? "imagem" : "imagens"}...`
          : dragActive
            ? "Pode soltar suas imagens"
            : "Arraste imagens para começar"}
      </h2>
      <p className={cn("mt-2 max-w-lg leading-relaxed text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        {isImporting
          ? "Preparando os arquivos para exibir na lista. Isso pode levar alguns segundos."
          : isDesktop
          ? "Compacte localmente, compare o resultado e baixe depois para a mesma pasta ou para outro local."
          : "O processamento acontece no seu dispositivo. Nenhuma imagem é enviada."}
      </p>
      <button
        type="button"
        onClick={chooseFiles}
        disabled={isImporting}
        className={cn("inline-flex items-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60", compact ? "mt-4 h-9 px-4 text-xs" : "mt-6 h-11 px-5 text-sm")}
      >
        {isImporting ? <LoaderCircle className="h-4 w-4 loading-spinner" /> : <MousePointerClick className="h-4 w-4" />}
        {isImporting ? "Carregando..." : "Escolher arquivos"}
      </button>
      <div className={cn("flex items-center gap-2 text-xs font-medium text-muted-foreground", compact ? "mt-3" : "mt-5")}>
        <FileImage className="h-3.5 w-3.5" />
        JPG, PNG, WEBP e AVIF
      </div>
    </section>
  );
}
