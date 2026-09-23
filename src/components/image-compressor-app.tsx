"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { downloadBlob, downloadImagesIndividual, downloadImagesZip } from "@/lib/download";
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
import { cn, getReduction, replaceExtension } from "@/lib/utils";
import { CompressionSettings as CompressionSettingsPanel } from "@/components/compression-settings";
import { ImageDropzone } from "@/components/image-dropzone";
import { ImageQueue } from "@/components/image-queue";
import { BetaImageWorkspace } from "@/components/beta-image-workspace";
import { WorkspaceIntro } from "@/components/workspace-intro";
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

function getImageIdentity(file: File, sourcePath?: string) {
  return sourcePath
    ? `path:${sourcePath}`
    : `file:${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
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

function isAbortError(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}

type ImageCompressorAppProps = {
  variant?: "current" | "beta";
};

export function ImageCompressorApp({ variant = "current" }: ImageCompressorAppProps) {
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
    () => deferredImages.find((image) => image.id === selectedId),
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

    const identities = new Set(imagesRef.current.map((image) => getImageIdentity(image.file, image.sourcePath)));
    const uniqueFiles = validFiles.filter(({ file, sourcePath }) => {
      const identity = getImageIdentity(file, sourcePath);
      if (identities.has(identity)) {
        return false;
      }
      identities.add(identity);
      return true;
    });
    const nextImages: QueueImage[] = uniqueFiles.map(({ file, sourcePath }) => ({
      id: createImageId(file),
      file,
      sourcePath,
      originalUrl: URL.createObjectURL(file),
      status: "pending"
    }));

    if (!nextImages.length) {
      return;
    }

    imagesRef.current = [...imagesRef.current, ...nextImages];
    updateImages((current) => [...current, ...nextImages]);
    setLastQueueSummary(undefined);

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
    imagesRef.current = imagesRef.current.filter((image) => image.id !== id);
    updateImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) {
        revokeImageUrls(image);
      }
      return current.filter((item) => item.id !== id);
    });
    setSelectedId((current) => (current === id ? undefined : current));
  }, [updateImages]);

  const removeDownloadedImages = useCallback((ids: string[]) => {
    const idsToRemove = new Set(ids);
    if (!idsToRemove.size) {
      return;
    }

    imagesRef.current = imagesRef.current.filter((image) => !idsToRemove.has(image.id));
    updateImages((current) => {
      current.filter((image) => idsToRemove.has(image.id)).forEach(revokeImageUrls);
      return current.filter((image) => !idsToRemove.has(image.id));
    });
    setSelectedId((current) => current && idsToRemove.has(current) ? undefined : current);
  }, [updateImages]);

  const clearAll = useCallback(() => {
    imagesRef.current = [];
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
    if (!image?.compressedBlob || !image.compressedName) {
      return;
    }

    try {
      if (!isDesktop) {
        await downloadBlob(image.compressedBlob, image.compressedName, {
          chooseLocation: downloadPreferences.mode === "choose-location"
        });
        if (downloadPreferences.removeAfterDownload && !options?.deferRemoval) {
          removeDownloadedImages([id]);
        }
        return;
      }

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

      if (downloadPreferences.removeAfterDownload && !options?.deferRemoval) {
        removeDownloadedImages([id]);
      } else {
        updateImages((current) => current.map((item) =>
          item.id === id ? { ...item, savedPath, downloadError: undefined } : item
        ));
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : "Nao foi possivel baixar a imagem compactada.";
      updateImages((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, downloadError: message }
            : item
        )
      );
    }
  }, [downloadPreferences, isDesktop, removeDownloadedImages, updateImages]);

  const downloadAllWeb = useCallback(async (format: "individual" | "zip") => {
    const readyImages = imagesRef.current.filter(
      (image) => image.status === "done" && image.compressedBlob && image.compressedName
    );
    if (!readyImages.length) {
      return;
    }

    try {
      const options = {
        chooseLocation: downloadPreferences.mode === "choose-location",
        subfolderName: downloadPreferences.saveInSubfolder
          ? normalizeSubfolderName(downloadPreferences.subfolderName)
          : undefined
      };
      const downloadedIds = format === "zip"
        ? (await downloadImagesZip(readyImages, options)
          ? readyImages.map((image) => image.id)
          : [])
        : await downloadImagesIndividual(readyImages, options);

      if (downloadPreferences.removeAfterDownload) {
        removeDownloadedImages(downloadedIds);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : "Não foi possível baixar as imagens.";
      const readyIds = new Set(readyImages.map((image) => image.id));
      updateImages((current) => current.map((image) =>
        readyIds.has(image.id) ? { ...image, downloadError: message } : image
      ));
    }
  }, [downloadPreferences, removeDownloadedImages, updateImages]);

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

        if (downloadPreferences.removeAfterDownload) {
          removeDownloadedImages([image.id]);
        } else {
          updateImages((current) => current.map((item) =>
            item.id === image.id ? { ...item, savedPath, downloadError: undefined } : item
          ));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível baixar a imagem compactada.";
        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, downloadError: message } : item))
        );
      }
    }
  }, [downloadPreferences, removeDownloadedImages, updateImages]);

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
    if (
      isDesktop ||
      isProcessing ||
      downloadPreferences.mode !== "same-folder" ||
      !downloadPreferences.autoDownload
    ) {
      return;
    }

    const hasUnfinishedImages = images.some((image) => image.status === "pending" || image.status === "processing");
    if (hasUnfinishedImages) {
      return;
    }

    const readyImages = images.filter(
      (image) =>
        image.status === "done" &&
        image.compressedBlob &&
        image.compressedName &&
        !autoDownloadAttemptedRef.current.has(image.id)
    );
    if (!readyImages.length) {
      return;
    }

    readyImages.forEach((image) => autoDownloadAttemptedRef.current.add(image.id));
    const readyIds = readyImages.map((image) => image.id);
    void downloadImagesZip(readyImages, {
      subfolderName: downloadPreferences.saveInSubfolder
        ? normalizeSubfolderName(downloadPreferences.subfolderName)
        : undefined
    }).then((started) => {
      if (started && downloadPreferences.removeAfterDownload) {
        removeDownloadedImages(readyIds);
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Não foi possível baixar o ZIP automaticamente.";
      const readyIdSet = new Set(readyIds);
      updateImages((current) => current.map((image) =>
        readyIdSet.has(image.id) ? { ...image, downloadError: message } : image
      ));
    });
  }, [downloadPreferences, images, isDesktop, isProcessing, removeDownloadedImages, updateImages]);

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
    <main className={cn("min-h-screen", variant === "beta" && "beta-shell")}>
      <header className={cn("app-header sticky top-0 z-30 border-b bg-card/90 backdrop-blur-xl", variant === "beta" && "beta-header border-slate-200 bg-white/90")}>
        <div className={cn("mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-6", variant === "beta" && "py-2.5")}>
          <div className="flex items-center gap-3">
            <img
              src="/icon.png"
              alt=""
              width={variant === "beta" ? 34 : 40}
              height={variant === "beta" ? 34 : 40}
              className={cn("rounded-xl shadow-sm shadow-primary/25 transition-transform duration-300 hover:rotate-[-4deg] hover:scale-105", variant === "beta" ? "h-[34px] w-[34px]" : "h-10 w-10")}
            />
            <div>
              <h1 className={cn("font-bold tracking-tight", variant === "beta" ? "text-base" : "text-lg")}>Compact Img</h1>
              {variant === "current" ? <p className="hidden text-xs text-muted-foreground sm:block">Imagens menores, sem perder o controle.</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav aria-label="Versão da interface" className="app-nav flex items-center rounded-xl border bg-background/80 p-1">
              <Link
                href="/"
                aria-current={variant === "current" ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  variant === "current" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Atual
              </Link>
              <Link
                href="/beta/"
                aria-current={variant === "beta" ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  variant === "beta" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                Beta
              </Link>
            </nav>
            {variant === "current" ? (
              <>
                <Button variant="outline" size="icon" className="sm:hidden" aria-label="Sobre o Compact Img" onClick={() => setIsAboutOpen(true)}>
                  <Info className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setIsAboutOpen(true)}>
                  <Info className="h-4 w-4" />
                  <span>Sobre</span>
                </Button>
                <div className="hidden items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
                  <LockKeyhole className="h-3.5 w-3.5 text-secondary" />
                  <span>Processamento 100% local</span>
                </div>
              </>
            ) : null}
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
                    <p className="mt-1">O envio e a fila compartilham a área principal; as configurações ficam na lateral e as opções avançadas podem ser recolhidas.</p>
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

      {variant === "beta" ? (
        <BetaImageWorkspace
          settings={settings}
          onSettingsChange={handleSettingsChange}
          downloadPreferences={downloadPreferences}
          onDownloadPreferencesChange={handleDownloadPreferencesChange}
          images={deferredImages}
          selectedImage={selectedImage}
          lastBatchSummary={lastQueueSummary}
          isProcessing={isProcessing}
          isCancelRequested={isCancelRequested}
          isDesktop={isDesktop}
          processedCount={processedCount}
          progress={progress}
          invalidFiles={invalidFiles}
          onInvalidFiles={setInvalidFiles}
          onFiles={addFiles}
          onSelect={setSelectedId}
          onRemove={removeImage}
          onProcess={processBatch}
          onCancelProcess={cancelProcessing}
          onClear={clearAll}
          onDownload={downloadImage}
          onDownloadAllDesktop={downloadAllDesktop}
          onDownloadAllWeb={downloadAllWeb}
        />
      ) : (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
        {!images.length && !lastQueueSummary ? <WorkspaceIntro /> : null}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-5 animate-enter-delayed">
            {invalidFiles.length ? (
              <div className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <strong>Arquivos ignorados:</strong> {invalidFiles.join(", ")}
              </div>
            ) : null}

            {images.length === 0 && !lastQueueSummary ? (
              <ImageDropzone
                onFiles={addFiles}
                onInvalidFiles={setInvalidFiles}
                isDesktop={isDesktop}
                compact
              />
            ) : (
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
                onDownloadAllWeb={downloadAllWeb}
                addImagesControl={
                  <ImageDropzone
                    onFiles={addFiles}
                    onInvalidFiles={setInvalidFiles}
                    isDesktop={isDesktop}
                    mode="button"
                    disabled={isProcessing}
                  />
                }
                isCancelRequested={isCancelRequested}
              />
            )}
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-5">
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
      )}
    </main>
  );
}
