"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type {
  CompressionSettings,
  QueueImage,
  WorkerRequest,
  WorkerResponse
} from "@/lib/image-types";
import { createImageId, isAcceptedImage, readImageDimensions } from "@/lib/image-utils";
import { formatBytes, getReduction, replaceExtension } from "@/lib/utils";
import { CompressionSettings as CompressionSettingsPanel } from "@/components/compression-settings";
import { DownloadActions } from "@/components/download-actions";
import { ImageDropzone } from "@/components/image-dropzone";
import { ImageQueue } from "@/components/image-queue";
import { ProgressBar } from "@/components/progress-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const imagesRef = useRef<QueueImage[]>([]);

  const handleSettingsChange = useCallback((newSettings: CompressionSettings) => {
    setSettings(newSettings);
    localStorage.setItem("compact-img-settings", JSON.stringify(newSettings));
  }, []);

  useEffect(() => {
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

  const addFiles = useCallback((files: File[]) => {
    const validFiles = files.filter(isAcceptedImage);
    const rejected = files.filter((file) => !isAcceptedImage(file)).map((file) => file.name);

    if (rejected.length) {
      setInvalidFiles(rejected);
    }

    const nextImages: QueueImage[] = validFiles.map((file) => ({
      id: createImageId(file),
      file,
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

      setImages((current) =>
        current.map((item) => {
          if (item.id !== image.id) {
            return item;
          }

          if (result.error || !result.blob) {
            return {
              ...item,
              status: "error",
              error: result.error ?? "Nao foi possivel compactar esta imagem."
            };
          }

          return {
            ...item,
            compressedBlob: result.blob,
            compressedUrl: URL.createObjectURL(result.blob),
            compressedName: replaceExtension(item.file.name, settings.outputFormat),
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
  }, [images, isProcessing, settings]);

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
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Compact Img</h1>
            <p className="text-sm text-muted-foreground">Compactacao de imagens em lote, 100% local.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            Sem upload para servidor
          </div>
        </div>
      </header>

      <div className="mx-auto flex flex-col gap-5 px-4 py-5 lg:px-6 max-w-7xl">
        {/* Row 1: ImageDropzone and CompressionSettings side-by-side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2">
            <ImageDropzone onFiles={addFiles} onInvalidFiles={setInvalidFiles} />
          </div>
          <div>
            <CompressionSettingsPanel settings={settings} onChange={handleSettingsChange} disabled={isProcessing} />
          </div>
        </div>

        {invalidFiles.length ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Arquivos ignorados: {invalidFiles.join(", ")}
          </div>
        ) : null}

        {/* Row 2: Batch actions card */}
        <Card className="w-full">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Acoes do lote</CardTitle>
            <span className="text-sm text-muted-foreground">
              {formatBytes(totalOriginal)}
              {totalCompressed ? ` -> ${formatBytes(totalCompressed)}` : ""}
              {totalReduction !== undefined ? ` (${totalReduction.toFixed(1)}% menor)` : ""}
            </span>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DownloadActions
              images={images}
              isProcessing={isProcessing}
              onProcess={processBatch}
              onClear={clearAll}
            />
            {isProcessing ? (
              <ProgressBar value={progress} label={`${processedCount} de ${images.length} imagens processadas`} />
            ) : null}
          </CardContent>
        </Card>

        {/* Row 3: ImageQueue */}
        <ImageQueue
          images={images}
          selectedId={selectedImage?.id}
          isProcessing={isProcessing}
          onSelect={setSelectedId}
          onRemove={removeImage}
        />
      </div>
    </main>
  );
}
