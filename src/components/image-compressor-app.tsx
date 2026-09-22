"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Info, LockKeyhole, ChevronDown } from "lucide-react";
import type {
  CompressionSettings,
  DownloadPreferences,
  DownloadMode,
  QueueImage,
  QueueSummary,
  SelectedImage,
  WorkerRequest,
  WorkerResponse
} from "@/lib/image-types";
import { createImageId, isAcceptedImage, readImageDimensions } from "@/lib/image-utils";
import {
  chooseDirectory,
  chooseSavePath,
  buildSubfolderDestinationPath,
  compressNativeJpeg,
  normalizeSubfolderName,
  isDesktopApp,
  joinPath,
  saveCompressedImage
} from "@/lib/desktop";
import { getReduction, replaceExtension } from "@/lib/utils";
import { CompressionSettings as CompressionSettingsPanel } from "@/components/compression-settings";
import { ImageDropzone } from "@/components/image-dropzone";
import { ImageQueue } from "@/components/image-queue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const DEFAULT_SETTINGS: CompressionSettings = {
  preserveOriginalDimensions: false,
  maxWidth: 2000,
  maxHeight: 2000,
  // A interface usa porcentagem; os encoders web recebem 80 / 100 = 0.8.
  quality: 80,
  outputFormat: "webp",
  jpegCompressionMode: "balanced",
  keepAspectRatio: true,
  stripMetadata: true
};
const DEFAULT_DOWNLOAD_MODE: DownloadMode = "same-folder";
const DEFAULT_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  mode: DEFAULT_DOWNLOAD_MODE,
  autoDownload: false,
  removeAfterDownload: false,
  saveInSubfolder: false,
  subfolderName: ""
};
const WORKER_TIMEOUT_MS = 30000;

type BatchSummaryAccumulator = QueueSummary & {
  reductionTotal: number;
  reductionCount: number;
};

class CompressionTimeoutError extends Error {
  constructor() {
    super("A compactacao demorou demais para responder no worker.");
    this.name = "CompressionTimeoutError";
  }
}

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
  return new Promise<WorkerResponse>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/image-compression.worker.ts", import.meta.url), {
      type: "module"
    });
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      worker.terminate();
      reject(new CompressionTimeoutError());
    }, WORKER_TIMEOUT_MS);

    const finalize = () => {
      if (settled) {
        return false;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      worker.terminate();
      return true;
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (!finalize()) {
        return;
      }

      resolve(event.data);
    };

    worker.onerror = (event) => {
      if (!finalize()) {
        return;
      }

      reject(new Error(event.message || "Erro ao executar o worker de compressao."));
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
  if (shouldUseNativeJpegCompression(settings, isDesktop, image.sourcePath)) {
    return compressNativeJpeg({
      id: image.id,
      sourcePath: image.sourcePath as string,
      settings
    });
  }

  const result = await compressInWorker(image.file, image.id, settings);

  if (result.error || !result.blob) {
    throw new Error(result.error ?? "Nao foi possivel compactar esta imagem no worker.");
  }

  return result;
}

export function ImageCompressorApp() {
  const [settings, setSettings] = useState<CompressionSettings>(DEFAULT_SETTINGS);
  const [images, setImages] = useState<QueueImage[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelRequested, setIsCancelRequested] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [downloadPreferences, setDownloadPreferences] = useState<DownloadPreferences>(DEFAULT_DOWNLOAD_PREFERENCES);
  const [lastQueueSummary, setLastQueueSummary] = useState<QueueSummary>();
  const [autoDownloadSettled, setAutoDownloadSettled] = useState(0);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const imagesRef = useRef<QueueImage[]>([]);
  const cancelRequestedRef = useRef(false);
  const autoDownloadAttemptedRef = useRef<Set<string>>(new Set());
  const autoDownloadInFlightRef = useRef<Set<string>>(new Set());
  const batchSummaryRef = useRef<BatchSummaryAccumulator | null>(null);
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

    const savedDownloadPreferences = localStorage.getItem("compact-img-download-preferences");
    if (savedDownloadPreferences) {
      try {
        setDownloadPreferences({ ...DEFAULT_DOWNLOAD_PREFERENCES, ...JSON.parse(savedDownloadPreferences) });
      } catch (e) {
        console.error("Erro ao carregar preferencias de download:", e);
      }
    }
  }, []);

  const handleDownloadPreferencesChange = useCallback((preferences: DownloadPreferences) => {
    setDownloadPreferences(preferences);
    localStorage.setItem("compact-img-download-preferences", JSON.stringify(preferences));
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
    setLastQueueSummary(undefined);
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
    setLastQueueSummary(undefined);
    setSelectedId(undefined);
    setInvalidFiles([]);
    setProcessedCount(0);
  }, [updateImages]);

  const processBatch = useCallback(async () => {
    if (!images.length || isProcessing) {
      return;
    }

    cancelRequestedRef.current = false;
    autoDownloadAttemptedRef.current.clear();
    autoDownloadInFlightRef.current.clear();
    batchSummaryRef.current = {
      totalCount: images.length,
      completedCount: 0,
      errorCount: 0,
      reductionTotal: 0,
      reductionCount: 0
    };
    setIsCancelRequested(false);
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
      while (queue.length && !cancelRequestedRef.current) {
        const image = queue.shift();
        if (!image) {
          return;
        }

        if (cancelRequestedRef.current) {
          return;
        }

        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, status: "processing" } : item))
        );

        let result: WorkerResponse;
        try {
          result = await compressImage(image, settings, isDesktop);
        } catch (error) {
          result = {
            id: image.id,
            error: error instanceof Error ? error.message : "Nao foi possivel compactar esta imagem."
          };
        }
        const compressedName = replaceExtension(image.file.name, settings.outputFormat);
        const batchSummary = batchSummaryRef.current;
        if (batchSummary) {
          if (result.error || !result.blob) {
            batchSummary.errorCount += 1;
          } else {
            batchSummary.completedCount += 1;
            const reduction = getReduction(image.file.size, result.blob.size);
            if (reduction !== undefined) {
              batchSummary.reductionTotal += reduction;
              batchSummary.reductionCount += 1;
            }
          }
        }

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

    try {
      await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));
    } finally {
      const batchSummary = batchSummaryRef.current;
      if (batchSummary) {
        setLastQueueSummary({
          totalCount: batchSummary.totalCount,
          completedCount: batchSummary.completedCount,
          errorCount: batchSummary.errorCount,
          averageReduction: batchSummary.reductionCount
            ? batchSummary.reductionTotal / batchSummary.reductionCount
            : undefined
        });
      }
      cancelRequestedRef.current = false;
      setIsCancelRequested(false);
      setIsProcessing(false);
    }
  }, [images, isDesktop, isProcessing, settings, updateImages]);

  const cancelProcessing = useCallback(() => {
    if (!isProcessing || cancelRequestedRef.current) {
      return;
    }

    cancelRequestedRef.current = true;
    setIsCancelRequested(true);
  }, [isProcessing]);

  const downloadImage = useCallback(async (id: string, options?: { deferRemoval?: boolean }) => {
    const image = imagesRef.current.find((item) => item.id === id);
    if (!image?.compressedBlob || !image.compressedName || !isDesktop) {
      return;
    }

    try {
      const mustChooseLocation = downloadPreferences.mode === "choose-location" || !image.sourcePath;
      let destinationPath: string | undefined;
      if (mustChooseLocation) {
        destinationPath = (await chooseSavePath(image.sourcePath, image.compressedName)) ?? undefined;
      } else if (downloadPreferences.saveInSubfolder && image.sourcePath) {
        destinationPath = buildSubfolderDestinationPath(
          image.sourcePath,
          normalizeSubfolderName(downloadPreferences.subfolderName),
          image.compressedName
        );
      }

      if (mustChooseLocation && !destinationPath) {
        return;
      }

      const savedPath = await saveCompressedImage({
        blob: image.compressedBlob,
        fileName: image.compressedName,
        sourcePath: image.sourcePath,
        destinationPath: destinationPath ?? undefined
      });

      updateImages((current) => current
        .map((item) => item.id === id ? { ...item, savedPath, downloadError: undefined } : item)
        .filter((item) => !(item.id === id && downloadPreferences.removeAfterDownload && !options?.deferRemoval)));
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
  }, [downloadPreferences, isDesktop, updateImages]);

  const downloadAllDesktop = useCallback(async () => {
    const readyImages = imagesRef.current.filter(
      (image) => image.status === "done" && image.compressedBlob && image.compressedName
    );

    if (!readyImages.length) {
      return;
    }

    let batchDirectory: string | null = null;

    if (downloadPreferences.mode === "choose-location") {
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
          } else if (downloadPreferences.saveInSubfolder) {
            destinationPath = buildSubfolderDestinationPath(
              image.sourcePath,
              normalizeSubfolderName(downloadPreferences.subfolderName),
              image.compressedName
            );
          }
        }

        const savedPath = await saveCompressedImage({
          blob: image.compressedBlob,
          fileName: image.compressedName,
          sourcePath: image.sourcePath,
          destinationPath
        });

        updateImages((current) => current
          .map((item) => item.id === image.id ? { ...item, savedPath, downloadError: undefined } : item)
          .filter((item) => !(item.id === image.id && downloadPreferences.removeAfterDownload)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível baixar a imagem compactada.";
        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, downloadError: message } : item))
        );
      }
    }
  }, [downloadPreferences, updateImages]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (!isDesktop || downloadPreferences.mode !== "same-folder" || !downloadPreferences.autoDownload) {
      return;
    }

    const readyImages = images.filter(
      (image) =>
        image.status === "done" &&
        image.compressedBlob &&
        image.compressedName &&
        !image.savedPath &&
        !autoDownloadAttemptedRef.current.has(image.id)
    );

    readyImages.forEach((image) => {
      autoDownloadAttemptedRef.current.add(image.id);
      autoDownloadInFlightRef.current.add(image.id);
      void downloadImage(image.id, { deferRemoval: true }).finally(() => {
        autoDownloadInFlightRef.current.delete(image.id);
        setAutoDownloadSettled((value) => value + 1);
      });
    });
  }, [downloadImage, downloadPreferences.autoDownload, downloadPreferences.mode, images, isDesktop]);

  useEffect(() => {
    const hasUnfinishedImages = images.some((image) => image.status === "pending" || image.status === "processing");
    const completedImages = images.filter((image) => image.status === "done");
    const allCompletedImagesAttempted = completedImages.every((image) =>
      autoDownloadAttemptedRef.current.has(image.id)
    );

    if (
      isProcessing ||
      !isDesktop ||
      !downloadPreferences.autoDownload ||
      !downloadPreferences.removeAfterDownload ||
      hasUnfinishedImages ||
      !allCompletedImagesAttempted ||
      autoDownloadInFlightRef.current.size > 0
    ) {
      return;
    }

    const savedIds = new Set(
      images
        .filter((image) => image.status === "done" && image.savedPath)
        .map((image) => image.id)
    );

    if (!savedIds.size) {
      return;
    }

    updateImages((current) => {
      current.filter((image) => savedIds.has(image.id)).forEach(revokeImageUrls);
      return current.filter((image) => !savedIds.has(image.id));
    });
    setSelectedId((current) => current && savedIds.has(current) ? undefined : current);
  }, [autoDownloadSettled, downloadPreferences.autoDownload, downloadPreferences.removeAfterDownload, images, isDesktop, isProcessing, updateImages]);

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAboutOpen(true)}>
              <Info className="h-4 w-4" />
              <span>Sobre</span>
            </Button>
            <div className="flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5 text-secondary" />
              <span className="hidden sm:inline">Processamento 100% local</span>
              <span className="sm:hidden">100% local</span>
            </div>
          </div>
        </div>
      </header>

      <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
        <DialogContent className="max-w-2xl">
          <div className="pr-8">
            <DialogTitle>Sobre o Compact Img</DialogTitle>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Compact Img é um compactador de imagens em lote que processa tudo localmente no seu dispositivo.
              Seus arquivos não são enviados para nenhum servidor.
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/35 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Versão atual</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">0.1.1</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Compare resultados, ajuste a qualidade e escolha como organizar seus arquivos compactados.
            </p>
          </div>

          <section className="grid gap-3">
            <h4 className="text-sm font-semibold">Notas da versão</h4>
            <div className="grid gap-2">
              <details open className="group rounded-lg border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>0.1.1 · Organização e controles de download</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground">Novidades</p>
                    <p className="mt-1">A fila ficou no topo, o painel de arquivos foi para a lateral e os downloads ganharam opções de destino, subpasta e limpeza automática.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Correções</p>
                    <p className="mt-1">Melhorias de espaçamento, estados dos botões e organização das configurações.</p>
                  </div>
                </div>
              </details>
              <details className="group rounded-lg border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>0.1.0 · Primeira versão</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground">Novidades</p>
                    <p className="mt-1">Compactação local em lote, pré-visualização antes e depois, formatos JPG, PNG, WEBP e AVIF e processamento por fila.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Correções</p>
                    <p className="mt-1">Versão inicial publicada com foco em processamento local e liberação segura dos previews.</p>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </DialogContent>
      </Dialog>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-5 animate-enter-delayed">
            {invalidFiles.length ? (
              <div className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <strong>Arquivos ignorados:</strong> {invalidFiles.join(", ")}
              </div>
            ) : null}

            <ImageQueue
              images={deferredImages}
              lastBatchSummary={lastQueueSummary}
              selectedId={selectedImage?.id}
              isProcessing={isProcessing}
              isDesktop={isDesktop}
              progress={progress}
              processedCount={processedCount}
              onSelect={setSelectedId}
              onRemove={removeImage}
              onProcess={processBatch}
              onCancelProcess={cancelProcessing}
              onClear={clearAll}
              onDownload={downloadImage}
              onDownloadAllDesktop={downloadAllDesktop}
              isCancelRequested={isCancelRequested}
            />
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-5">
            <ImageDropzone
              onFiles={addFiles}
              onInvalidFiles={setInvalidFiles}
              isDesktop={isDesktop}
              compact
            />
            <CompressionSettingsPanel
              settings={settings}
              onChange={handleSettingsChange}
              downloadPreferences={downloadPreferences}
              onDownloadPreferencesChange={handleDownloadPreferencesChange}
              isDesktop={isDesktop}
              disabled={isProcessing}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
