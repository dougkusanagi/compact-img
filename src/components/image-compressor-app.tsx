"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import type {
  CompressionSettings,
  DownloadMode,
  QueueImage,
  SelectedImage,
  WorkerRequest,
  WorkerResponse
} from "@/lib/image-types";
import { createImageId, isAcceptedImage, readImageDimensions } from "@/lib/image-utils";
import {
  chooseDirectory,
  chooseSavePath,
  compressNativeJpeg,
  isDesktopApp,
  joinPath,
  saveCompressedImage
} from "@/lib/desktop";
import { replaceExtension } from "@/lib/utils";
import { CompressionSettings as CompressionSettingsPanel } from "@/components/compression-settings";
import { ImageDropzone } from "@/components/image-dropzone";
import { ImageQueue } from "@/components/image-queue";

const DEFAULT_SETTINGS: CompressionSettings = {
  preserveOriginalDimensions: true,
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 78,
  outputFormat: "webp",
  jpegCompressionMode: "balanced",
  keepAspectRatio: true,
  stripMetadata: true
};
const DEFAULT_DOWNLOAD_MODE: DownloadMode = "same-folder";

function getProcessingConcurrency(
  totalImages: number,
  settings: CompressionSettings,
  isDesktop: boolean
) {
  const hardwareConcurrency =
    typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : 4;

  const maxConcurrency = shouldUseNativeJpegCompression(settings, isDesktop, "native-jpeg")
    ? settings.jpegCompressionMode === "fast"
      ? 2
      : 1
    : 4;

  return Math.min(totalImages, Math.max(1, Math.min(maxConcurrency, hardwareConcurrency - 1 || 1)));
}

function shouldUseNativeJpegCompression(
  settings: CompressionSettings,
  isDesktop: boolean,
  sourcePath?: string
) {
  return isDesktop && Boolean(sourcePath) && settings.outputFormat === "jpeg";
}

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

async function compressImage(
  image: QueueImage,
  settings: CompressionSettings,
  isDesktop: boolean
) {
  return shouldUseNativeJpegCompression(settings, isDesktop, image.sourcePath)
    ? compressNativeJpeg({
        id: image.id,
        sourcePath: image.sourcePath as string,
        settings
      })
    : compressInWorker(image.file, image.id, settings);
}

export function ImageCompressorApp() {
  const [settings, setSettings] = useState<CompressionSettings>(DEFAULT_SETTINGS);
  const [images, setImages] = useState<QueueImage[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [downloadMode, setDownloadMode] = useState<DownloadMode>(DEFAULT_DOWNLOAD_MODE);
  const imagesRef = useRef<QueueImage[]>([]);
  const deferredImages = useDeferredValue(images);

  const updateImages = useCallback((updater: (current: QueueImage[]) => QueueImage[]) => {
    startTransition(() => {
      setImages(updater);
    });
  }, []);

  const handleSettingsChange = useCallback((newSettings: CompressionSettings) => {
    setSettings(newSettings);
    localStorage.setItem("compact-img-settings", JSON.stringify(newSettings));
  }, []);

  useEffect(() => {
    setIsDesktop(isDesktopApp());
    const saved = localStorage.getItem("compact-img-settings");
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Erro ao carregar configuracoes:", e);
      }
    }

    const savedDownloadMode = localStorage.getItem("compact-img-download-mode");
    if (savedDownloadMode === "same-folder" || savedDownloadMode === "choose-location") {
      setDownloadMode(savedDownloadMode);
    }
  }, []);

  const handleDownloadModeChange = useCallback((mode: DownloadMode) => {
    setDownloadMode(mode);
    localStorage.setItem("compact-img-download-mode", mode);
  }, []);

  const selectedImage = useMemo(
    () => deferredImages.find((image) => image.id === selectedId) ?? deferredImages[0],
    [deferredImages, selectedId]
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

    updateImages((current) => [...current, ...nextImages]);
    setSelectedId((current) => current ?? nextImages[0].id);

    nextImages.forEach((image) => {
      readImageDimensions(image.file)
        .then((dimensions) => {
          updateImages((current) =>
            current.map((item) => (item.id === image.id ? { ...item, originalDimensions: dimensions } : item))
          );
        })
        .catch(() => {
          updateImages((current) =>
            current.map((item) =>
              item.id === image.id
                ? { ...item, status: "error", error: "Nao foi possivel ler as dimensoes da imagem." }
                : item
            )
          );
        });
    });
  }, [updateImages]);

  const removeImage = useCallback((id: string) => {
    updateImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) {
        revokeImageUrls(image);
      }
      return current.filter((item) => item.id !== id);
    });
    setSelectedId((current) => (current === id ? undefined : current));
  }, [updateImages]);

  const clearAll = useCallback(() => {
    updateImages((current) => {
      current.forEach(revokeImageUrls);
      return [];
    });
    setSelectedId(undefined);
    setInvalidFiles([]);
    setProcessedCount(0);
  }, [updateImages]);

  const processBatch = useCallback(async () => {
    if (!images.length || isProcessing) {
      return;
    }

    setIsProcessing(true);
    startTransition(() => {
      setProcessedCount(0);
    });
    updateImages((current) =>
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
          downloadError: undefined,
          status: "pending",
          error: undefined
        };
      })
    );

    const queue = [...images];
    const concurrency = getProcessingConcurrency(queue.length, settings, isDesktop);

    const workerLoop = async () => {
      while (queue.length) {
        const image = queue.shift();
        if (!image) {
          return;
        }

        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, status: "processing" } : item))
        );

        const result = await compressImage(image, settings, isDesktop);
        const compressedName = replaceExtension(image.file.name, settings.outputFormat);

        updateImages((current) =>
          current.map((item) => {
            if (item.id !== image.id) {
              return item;
            }

            if (result.error || !result.blob) {
              return {
                ...item,
                compressedBlob: result.blob,
                compressedUrl: result.blob ? URL.createObjectURL(result.blob) : undefined,
                compressedName: result.blob ? compressedName : undefined,
                originalDimensions: result.originalDimensions ?? item.originalDimensions,
                finalDimensions: result.finalDimensions,
                status: "error",
                error: result.error ?? "Nao foi possivel compactar esta imagem."
              };
            }

            return {
              ...item,
              compressedBlob: result.blob,
              compressedUrl: URL.createObjectURL(result.blob),
              compressedName,
              savedPath: undefined,
              originalDimensions: result.originalDimensions ?? item.originalDimensions,
              finalDimensions: result.finalDimensions,
              status: "done",
              error: undefined,
              downloadError: undefined
            };
          })
        );

        startTransition(() => {
          setProcessedCount((count) => count + 1);
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));

    setIsProcessing(false);
  }, [images, isDesktop, isProcessing, settings, updateImages]);

  const downloadImage = useCallback(async (id: string) => {
    const image = imagesRef.current.find((item) => item.id === id);
    if (!image?.compressedBlob || !image.compressedName || !isDesktop) {
      return;
    }

    try {
      const mustChooseLocation = downloadMode === "choose-location" || !image.sourcePath;
      const destinationPath = mustChooseLocation ? await chooseSavePath(image.sourcePath, image.compressedName) : undefined;

      if (mustChooseLocation && !destinationPath) {
        return;
      }

      const savedPath = await saveCompressedImage({
        blob: image.compressedBlob,
        fileName: image.compressedName,
        sourcePath: image.sourcePath,
        destinationPath: destinationPath ?? undefined
      });

      updateImages((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, savedPath, downloadError: undefined }
            : item
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel baixar a imagem compactada.";
      updateImages((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, downloadError: message }
            : item
        )
      );
    }
  }, [downloadMode, isDesktop, updateImages]);

  const downloadAllDesktop = useCallback(async () => {
    const readyImages = imagesRef.current.filter(
      (image) => image.status === "done" && image.compressedBlob && image.compressedName
    );

    if (!readyImages.length) {
      return;
    }

    let batchDirectory: string | null = null;

    if (downloadMode === "choose-location") {
      batchDirectory = await chooseDirectory();
      if (!batchDirectory) {
        return; // Usuário cancelou a seleção da pasta
      }
    }

    for (const image of readyImages) {
      if (!image.compressedBlob || !image.compressedName) {
        continue;
      }

      try {
        let destinationPath: string | undefined = undefined;

        if (batchDirectory) {
          destinationPath = joinPath(batchDirectory, image.compressedName);
        } else {
          // Se "same-folder" mas a imagem não tem sourcePath, precisa escolher local
          if (!image.sourcePath) {
            const chosen = await chooseSavePath(undefined, image.compressedName);
            if (!chosen) {
              continue;
            }
            destinationPath = chosen;
          }
        }

        const savedPath = await saveCompressedImage({
          blob: image.compressedBlob,
          fileName: image.compressedName,
          sourcePath: image.sourcePath,
          destinationPath
        });

        updateImages((current) =>
          current.map((item) =>
            item.id === image.id ? { ...item, savedPath, downloadError: undefined } : item
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível baixar a imagem compactada.";
        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, downloadError: message } : item))
        );
      }
    }
  }, [downloadMode, updateImages]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(revokeImageUrls);
    };
  }, []);

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
              images={deferredImages}
              selectedId={selectedImage?.id}
              isProcessing={isProcessing}
              isDesktop={isDesktop}
              downloadMode={downloadMode}
              progress={progress}
              processedCount={processedCount}
              onSelect={setSelectedId}
              onRemove={removeImage}
              onProcess={processBatch}
              onClear={clearAll}
              onDownload={downloadImage}
              onDownloadAllDesktop={downloadAllDesktop}
              onDownloadModeChange={handleDownloadModeChange}
            />
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-5">
            <CompressionSettingsPanel settings={settings} onChange={handleSettingsChange} disabled={isProcessing} />
          </aside>
        </div>
      </div>
    </main>
  );
}
