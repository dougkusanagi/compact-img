"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  compressNativeImage,
  getParentDirectory,
  normalizeSubfolderName,
  isDesktopApp,
  joinPath,
  readNativeImageDimensions,
  saveCompressedImage
} from "@/lib/desktop";
import { getReduction, replaceExtension } from "@/lib/utils";
import { ClassicImageWorkspace } from "@/components/classic-image-workspace";
import { PremiumImageWorkspace } from "@/components/premium-image-workspace";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { NoticeToaster, type Notice, type NoticeTone } from "@/components/notice-toaster";

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

type SaveOutcome =
  | { status: "saved"; path?: string }
  | { status: "failed"; message: string }
  | { status: "cancelled" };

function pluralizeImages(count: number) {
  return count === 1 ? "1 imagem" : `${count} imagens`;
}

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

  // O Rust processa cada imagem em uma thread propria (o AVIF ja usa varias threads
  // internamente). O teto de 4 limita a memoria de fotos grandes em paralelo.
  const maxConcurrency = isDesktop
    ? settings.outputFormat === "avif"
      ? 2
      : Math.min(4, Math.max(1, Math.floor(hardwareConcurrency / 2)))
    : 4;

  return Math.max(1, Math.min(totalImages, maxConcurrency, Math.max(1, hardwareConcurrency - 1)));
}

function shouldUseNativeCompression(isDesktop: boolean, sourcePath?: string) {
  return isDesktop && Boolean(sourcePath);
}

function getWorkerTimeoutMs(file: File) {
  // Imagens grandes e formatos lentos (AVIF) precisam de mais tempo que o piso de 30s.
  return WORKER_TIMEOUT_MS + Math.ceil(file.size / (1024 * 1024)) * 5000;
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
    }, getWorkerTimeoutMs(file));

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
  if (shouldUseNativeCompression(isDesktop, image.sourcePath)) {
    return compressNativeImage({
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

export function ImageCompressorApp({ layout = "classic" }: { layout?: "classic" | "beta" }) {
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const imagesRef = useRef<QueueImage[]>([]);
  const cancelRequestedRef = useRef(false);
  const autoDownloadAttemptedRef = useRef<Set<string>>(new Set());
  const autoDownloadInFlightRef = useRef<Set<string>>(new Set());
  const autoDownloadResultRef = useRef({ saved: 0, failed: 0, lastDirectory: undefined as string | undefined });
  const noticeSeqRef = useRef(0);
  const batchSummaryRef = useRef<BatchSummaryAccumulator | null>(null);
  const deferredImages = useDeferredValue(images);

  const pushNotice = useCallback((tone: NoticeTone, message: string, key?: string) => {
    noticeSeqRef.current += 1;
    const seq = noticeSeqRef.current;
    const id = key ?? `notice-${seq}`;
    setNotices((current) => [...current.filter((notice) => notice.id !== id), { id, seq, tone, message }].slice(-4));
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

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
    setSelectedId((current) => current ?? nextImages[0].id);
    setLastQueueSummary(undefined);

    nextImages.forEach((image) => {
      (isDesktop && image.sourcePath
        ? readNativeImageDimensions(image.sourcePath).catch(() => readImageDimensions(image.file))
        : readImageDimensions(image.file))
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
  }, [isDesktop, updateImages]);

  const removeImage = useCallback((id: string) => {
    imagesRef.current = imagesRef.current.filter((image) => image.id !== id);
    updateImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) {
        revokeImageUrls(image);
      }
      return current.filter((item) => item.id !== id);
    });
    setSelectedId((current) => (current === id ? imagesRef.current[0]?.id : current));
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
    setSelectedId((current) => current && idsToRemove.has(current) ? imagesRef.current[0]?.id : current);
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
    autoDownloadResultRef.current = { saved: 0, failed: 0, lastDirectory: undefined };
    dismissNotice("auto-download");
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
      if (cancelRequestedRef.current && batchSummary) {
        pushNotice(
          "info",
          `Compactação cancelada. ${batchSummary.completedCount} de ${batchSummary.totalCount} imagens foram concluídas.`
        );
      } else if (batchSummary?.errorCount) {
        pushNotice(
          "error",
          `${pluralizeImages(batchSummary.errorCount)} não ${batchSummary.errorCount === 1 ? "pôde" : "puderam"} ser compactada${batchSummary.errorCount === 1 ? "" : "s"}. Veja o erro em cada item da lista.`
        );
      }
      cancelRequestedRef.current = false;
      setIsCancelRequested(false);
      setIsProcessing(false);
    }
  }, [dismissNotice, images, isDesktop, isProcessing, pushNotice, settings, updateImages]);

  const cancelProcessing = useCallback(() => {
    if (!isProcessing || cancelRequestedRef.current) {
      return;
    }

    cancelRequestedRef.current = true;
    setIsCancelRequested(true);
  }, [isProcessing]);

  const saveImage = useCallback(async (
    id: string,
    options?: { deferRemoval?: boolean; silent?: boolean }
  ): Promise<SaveOutcome> => {
    const image = imagesRef.current.find((item) => item.id === id);
    if (!image?.compressedBlob || !image.compressedName) {
      return { status: "cancelled" };
    }

    try {
      let savedPath: string | undefined;

      if (!isDesktop) {
        await downloadBlob(image.compressedBlob, image.compressedName, {
          chooseLocation: downloadPreferences.mode === "choose-location"
        });
      } else {
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
          return { status: "cancelled" };
        }

        savedPath = await saveCompressedImage({
          blob: image.compressedBlob,
          fileName: image.compressedName,
          sourcePath: image.sourcePath,
          destinationPath: destinationPath ?? undefined
        });
      }

      if (downloadPreferences.removeAfterDownload && !options?.deferRemoval) {
        removeDownloadedImages([id]);
      } else if (savedPath) {
        updateImages((current) => current.map((item) =>
          item.id === id ? { ...item, savedPath, downloadError: undefined } : item
        ));
      }

      if (!options?.silent) {
        pushNotice(
          "success",
          savedPath
            ? `${image.compressedName} salva em ${getParentDirectory(savedPath)}.`
            : `Download de ${image.compressedName} iniciado.`
        );
      }
      return { status: "saved", path: savedPath };
    } catch (error) {
      if (isAbortError(error)) {
        return { status: "cancelled" };
      }
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Nao foi possivel baixar a imagem compactada.";
      updateImages((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, downloadError: message }
            : item
        )
      );
      if (!options?.silent) {
        pushNotice("error", `Não foi possível salvar ${image.compressedName}: ${message}`);
      }
      return { status: "failed", message };
    }
  }, [downloadPreferences, isDesktop, pushNotice, removeDownloadedImages, updateImages]);

  const downloadImage = useCallback(async (id: string) => {
    await saveImage(id);
  }, [saveImage]);

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
      if (downloadedIds.length) {
        pushNotice(
          "success",
          format === "zip"
            ? `ZIP com ${pluralizeImages(downloadedIds.length)} baixado.`
            : `${pluralizeImages(downloadedIds.length)} baixada${downloadedIds.length === 1 ? "" : "s"}.`
        );
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
      pushNotice("error", message);
    }
  }, [downloadPreferences, pushNotice, removeDownloadedImages, updateImages]);

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

    let savedCount = 0;
    let failedCount = 0;
    let lastDirectory: string | undefined;

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
        savedCount += 1;
        lastDirectory = getParentDirectory(savedPath);

        if (downloadPreferences.removeAfterDownload) {
          removeDownloadedImages([image.id]);
        } else {
          updateImages((current) => current.map((item) =>
            item.id === image.id ? { ...item, savedPath, downloadError: undefined } : item
          ));
        }
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Não foi possível baixar a imagem compactada.";
        updateImages((current) =>
          current.map((item) => (item.id === image.id ? { ...item, downloadError: message } : item))
        );
      }
    }

    if (failedCount) {
      pushNotice(
        "error",
        `${pluralizeImages(failedCount)} não ${failedCount === 1 ? "foi salva" : "foram salvas"}${savedCount ? `; ${pluralizeImages(savedCount)} ${savedCount === 1 ? "foi salva" : "foram salvas"}` : ""}. Veja o erro em cada item da lista.`
      );
    } else if (savedCount) {
      pushNotice(
        "success",
        `${pluralizeImages(savedCount)} ${savedCount === 1 ? "salva" : "salvas"}${batchDirectory || savedCount === 1 ? ` em ${batchDirectory ?? lastDirectory}` : ""}.`
      );
    }
  }, [downloadPreferences, pushNotice, removeDownloadedImages, updateImages]);

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
      void saveImage(image.id, { deferRemoval: true, silent: true }).then((outcome) => {
        const result = autoDownloadResultRef.current;
        if (outcome.status === "cancelled") {
          return;
        }
        if (outcome.status === "saved") {
          result.saved += 1;
          result.lastDirectory = outcome.path ? getParentDirectory(outcome.path) : result.lastDirectory;
        } else {
          result.failed += 1;
        }
        const savedText = result.saved
          ? `${pluralizeImages(result.saved)} ${result.saved === 1 ? "salva" : "salvas"} automaticamente${result.saved === 1 && result.lastDirectory ? ` em ${result.lastDirectory}` : ""}.`
          : "";
        const failedText = result.failed
          ? `${pluralizeImages(result.failed)} não ${result.failed === 1 ? "foi salva" : "foram salvas"}. Veja o erro em cada item da lista.`
          : "";
        pushNotice(result.failed ? "error" : "success", [savedText, failedText].filter(Boolean).join(" "), "auto-download");
      }).finally(() => {
        autoDownloadInFlightRef.current.delete(image.id);
        setAutoDownloadSettled((value) => value + 1);
      });
    });
  }, [downloadPreferences.autoDownload, downloadPreferences.mode, images, isDesktop, pushNotice, saveImage]);

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
      if (started) {
        pushNotice("success", `ZIP com ${pluralizeImages(readyIds.length)} baixado automaticamente.`);
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Não foi possível baixar o ZIP automaticamente.";
      const readyIdSet = new Set(readyIds);
      updateImages((current) => current.map((image) =>
        readyIdSet.has(image.id) ? { ...image, downloadError: message } : image
      ));
      pushNotice("error", message);
    });
  }, [downloadPreferences, images, isDesktop, isProcessing, pushNotice, removeDownloadedImages, updateImages]);

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

  const Workspace = layout === "beta" ? PremiumImageWorkspace : ClassicImageWorkspace;

  return (
    <div data-image-compressor-app className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-5 xl:px-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <img
              src="/icon.svg"
              alt=""
              width={34}
              height={34}
              className="h-[34px] w-[34px] rounded-md transition-transform duration-300 hover:rotate-[-4deg] hover:scale-105"
            />
            <h1 className="whitespace-nowrap text-sm font-bold tracking-tight sm:text-base">Compact Img</h1>
          </div>
          <LayoutSwitcher layout={layout} />
        </div>
      </header>
      <Workspace
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
          onClosePreview={() => setSelectedId(undefined)}
          onRemove={removeImage}
          onProcess={processBatch}
          onCancelProcess={cancelProcessing}
          onClear={clearAll}
          onDownload={downloadImage}
          onDownloadAllDesktop={downloadAllDesktop}
          onDownloadAllWeb={downloadAllWeb}
      />
      <NoticeToaster notices={notices} onDismiss={dismissNotice} />
    </div>
  );
}
