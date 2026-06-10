"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, Settings2, Sparkles } from "lucide-react";
import type {
  CompressionSettings,
  QueueImage,
  SelectedImage,
  WorkerRequest,
  WorkerResponse
} from "@/lib/image-types";
import { createImageId, isAcceptedImage, readImageDimensions } from "@/lib/image-utils";
import { isDesktopApp, saveCompressedImage } from "@/lib/desktop";
import { formatBytes, getReduction, replaceExtension } from "@/lib/utils";
import { CompressionSettings as CompressionSettingsPanel } from "@/components/compression-settings";
import { DownloadActions } from "@/components/download-actions";
import { ImageDropzone } from "@/components/image-dropzone";
import { ImageQueue } from "@/components/image-queue";
import { ProgressBar } from "@/components/progress-bar";
import { Card, CardContent } from "@/components/ui/card";

const DEFAULT_SETTINGS: CompressionSettings = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 78,
  outputFormat: "webp",
  keepAspectRatio: true,
  stripMetadata: true
};

function compressInWorker(file: File, id: string, settings: CompressionSettings) {
  return new Promise<WorkerResponse>((resolve) => {
    const worker = new Worker(new URL("../workers/image-compression.worker.ts", import.meta.url), {
      type: "module"
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (event) => {
      worker.terminate();
      resolve({
        id,
        error: event.message || "Erro ao executar o worker de compressao."
      });
    };

    const request: WorkerRequest = { id, file, settings };
    worker.postMessage(request);
  });
}

function revokeImageUrls(image: QueueImage) {
  URL.revokeObjectURL(image.originalUrl);
  if (image.compressedUrl) {
    URL.revokeObjectURL(image.compressedUrl);
  }
}

export function ImageCompressorApp() {
  const [settings, setSettings] = useState<CompressionSettings>(DEFAULT_SETTINGS);
  const [images, setImages] = useState<QueueImage[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const imagesRef = useRef<QueueImage[]>([]);

  const handleSettingsChange = useCallback((newSettings: CompressionSettings) => {
    setSettings(newSettings);
    localStorage.setItem("compact-img-settings", JSON.stringify(newSettings));
  }, []);

  useEffect(() => {
    setIsDesktop(isDesktopApp());
    const saved = localStorage.getItem("compact-img-settings");
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar configuracoes:", e);
      }
    }
  }, []);

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedId) ?? images[0],
    [images, selectedId]
  );

  const progress = images.length ? (processedCount / images.length) * 100 : 0;

  const addFiles = useCallback((selectedImages: SelectedImage[]) => {
    const validFiles = selectedImages.filter(({ file }) => isAcceptedImage(file));
    const rejected = selectedImages
      .filter(({ file }) => !isAcceptedImage(file))
      .map(({ file }) => file.name);

    if (rejected.length) {
      setInvalidFiles(rejected);
    }

    const nextImages: QueueImage[] = validFiles.map(({ file, sourcePath }) => ({
      id: createImageId(file),
      file,
      sourcePath,
      originalUrl: URL.createObjectURL(file),
      status: "pending"
    }));

    if (!nextImages.length) {
      return;
    }

    setImages((current) => [...current, ...nextImages]);
    setSelectedId((current) => current ?? nextImages[0].id);

    nextImages.forEach((image) => {
      readImageDimensions(image.file)
        .then((dimensions) => {
          setImages((current) =>
            current.map((item) => (item.id === image.id ? { ...item, originalDimensions: dimensions } : item))
          );
        })
        .catch(() => {
          setImages((current) =>
            current.map((item) =>
              item.id === image.id
                ? { ...item, status: "error", error: "Nao foi possivel ler as dimensoes da imagem." }
                : item
            )
          );
        });
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) {
        revokeImageUrls(image);
      }
      return current.filter((item) => item.id !== id);
    });
    setSelectedId((current) => (current === id ? undefined : current));
  }, []);

  const clearAll = useCallback(() => {
    setImages((current) => {
      current.forEach(revokeImageUrls);
      return [];
    });
    setSelectedId(undefined);
    setInvalidFiles([]);
    setProcessedCount(0);
  }, []);

  const processBatch = useCallback(async () => {
    if (!images.length || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setProcessedCount(0);
    setImages((current) =>
      current.map((image) => {
        if (image.compressedUrl) {
          URL.revokeObjectURL(image.compressedUrl);
        }
        return {
          ...image,
          compressedUrl: undefined,
          compressedBlob: undefined,
          compressedName: undefined,
          savedPath: undefined,
          finalDimensions: undefined,
          status: "pending",
          error: undefined
        };
      })
    );

    for (const image of images) {
      setImages((current) =>
        current.map((item) => (item.id === image.id ? { ...item, status: "processing" } : item))
      );

      const result = await compressInWorker(image.file, image.id, settings);
      const compressedName = replaceExtension(image.file.name, settings.outputFormat);
      let savedPath: string | undefined;
      let saveError: string | undefined;

      if (result.blob && image.sourcePath && isDesktop) {
        try {
          savedPath = await saveCompressedImage(image.sourcePath, compressedName, result.blob);
        } catch (error) {
          saveError =
            error instanceof Error ? error.message : String(error || "Nao foi possivel salvar a imagem compactada.");
        }
      }

      setImages((current) =>
        current.map((item) => {
          if (item.id !== image.id) {
            return item;
          }

          if (result.error || !result.blob || saveError) {
            return {
              ...item,
              compressedBlob: result.blob,
              compressedUrl: result.blob ? URL.createObjectURL(result.blob) : undefined,
              compressedName: result.blob ? compressedName : undefined,
              originalDimensions: result.originalDimensions ?? item.originalDimensions,
              finalDimensions: result.finalDimensions,
              status: "error",
              error: result.error ?? saveError ?? "Nao foi possivel compactar esta imagem."
            };
          }

          return {
            ...item,
            compressedBlob: result.blob,
            compressedUrl: URL.createObjectURL(result.blob),
            compressedName,
            savedPath,
            originalDimensions: result.originalDimensions ?? item.originalDimensions,
            finalDimensions: result.finalDimensions,
            status: "done",
            error: undefined
          };
        })
      );
      setProcessedCount((count) => count + 1);
    }

    setIsProcessing(false);
  }, [images, isDesktop, isProcessing, settings]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(revokeImageUrls);
    };
  }, []);

  const totalOriginal = images.reduce((sum, image) => sum + image.file.size, 0);
  const totalCompressed = images.reduce((sum, image) => sum + (image.compressedBlob?.size ?? 0), 0);
  const totalReduction = totalCompressed ? getReduction(totalOriginal, totalCompressed) : undefined;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <img
              src="./icon.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl shadow-sm shadow-primary/25"
            />
            <div>
              <h1 className="text-lg font-bold tracking-tight">Compact Img</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Imagens menores, sem perder o controle.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 text-secondary" />
            <span className="hidden sm:inline">Processamento 100% local</span>
            <span className="sm:hidden">100% local</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
        <div className="mb-6 animate-enter">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Compactação simples e rápida
          </div>
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            Otimize várias imagens de uma vez.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Adicione os arquivos, ajuste como preferir e compacte. Todo o processo acontece no seu dispositivo.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-5 animate-enter-delayed">
            <ImageDropzone
              onFiles={addFiles}
              onInvalidFiles={setInvalidFiles}
              isDesktop={isDesktop}
            />

            {invalidFiles.length ? (
              <div className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <strong>Arquivos ignorados:</strong> {invalidFiles.join(", ")}
              </div>
            ) : null}

            <ImageQueue
              images={images}
              selectedId={selectedImage?.id}
              isProcessing={isProcessing}
              isDesktop={isDesktop}
              onSelect={setSelectedId}
              onRemove={removeImage}
            />
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-5">
            <CompressionSettingsPanel settings={settings} onChange={handleSettingsChange} disabled={isProcessing} />

            <Card className="overflow-hidden border-primary/15 shadow-md shadow-primary/[0.04]">
              <CardContent className="grid gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">Resumo do lote</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {images.length ? `${images.length} imagem(ns) pronta(s)` : "Adicione imagens para começar"}
                    </p>
                  </div>
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                </div>

                {images.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-muted/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Original</p>
                      <p className="mt-1 text-sm font-bold">{formatBytes(totalOriginal)}</p>
                    </div>
                    <div className="rounded-md bg-primary/[0.07] p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Resultado</p>
                      <p className="mt-1 text-sm font-bold text-primary">
                        {totalCompressed ? formatBytes(totalCompressed) : "Aguardando"}
                      </p>
                    </div>
                  </div>
                ) : null}

                {totalReduction !== undefined ? (
                  <div className="flex items-center justify-between rounded-md bg-secondary/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Economia total</span>
                    <strong className="text-emerald-700">{totalReduction.toFixed(1)}%</strong>
                  </div>
                ) : null}

                <DownloadActions
                  images={images}
                  isProcessing={isProcessing}
                  isDesktop={isDesktop}
                  onProcess={processBatch}
                  onClear={clearAll}
                />
                {isProcessing ? (
                  <ProgressBar value={progress} label={`${processedCount} de ${images.length} imagens processadas`} />
                ) : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
