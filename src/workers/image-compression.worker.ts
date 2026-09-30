import type { WorkerRequest, WorkerResponse } from "../lib/image-types";
import { encodeToTarget } from "../lib/target-size";
import { getTargetDimensions } from "../lib/image-processing";

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif"
} as const;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file, settings } = event.data;

  try {
    if (!("OffscreenCanvas" in self)) {
      throw new Error("Seu navegador nao suporta OffscreenCanvas para processar em worker.");
    }

    const bitmap = await createImageBitmap(file);
    const originalDimensions = {
      width: bitmap.width,
      height: bitmap.height
    };
    let finalDimensions = getTargetDimensions(
      originalDimensions.width,
      originalDimensions.height,
      settings.preserveOriginalDimensions,
      settings.maxWidth,
      settings.maxHeight,
      settings.keepAspectRatio
    );

    const encode = async (dimensions: typeof finalDimensions, quality: number) => {
      const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
      const context = canvas.getContext("2d", { alpha: settings.outputFormat !== "jpeg" });
      if (!context) throw new Error("Não foi possível criar o contexto de desenho.");
      if (settings.outputFormat === "jpeg") {
        context.fillStyle = /^#[0-9a-f]{6}$/i.test(settings.jpegBackgroundColor ?? "") ? settings.jpegBackgroundColor! : "#ffffff";
        context.fillRect(0, 0, dimensions.width, dimensions.height);
      }
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
      const output = await canvas.convertToBlob({ type: MIME_BY_FORMAT[settings.outputFormat], quality: settings.outputFormat === "png" ? undefined : quality / 100 });
      if (output.type !== MIME_BY_FORMAT[settings.outputFormat]) throw new Error(`Seu navegador não conseguiu gerar ${settings.outputFormat.toUpperCase()}. Tente outro formato.`);
      return output;
    };
    let blob: Blob;
    try {
      if (settings.compressionMode === "target-size") {
        const result = await encodeToTarget(finalDimensions, (settings.maxFileSizeKB ?? 300) * 1024,
          { lossless: settings.outputFormat === "png", preserveDimensions: settings.preserveOriginalDimensions }, encode);
        blob = result.output;
        finalDimensions = result.dimensions;
      } else blob = await encode(finalDimensions, settings.quality);
    } finally { bitmap.close(); }

    const response: WorkerResponse = {
      id,
      blob,
      originalDimensions,
      finalDimensions
    };

    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      error: error instanceof Error ? error.message : "Erro inesperado na compressao."
    };
    self.postMessage(response);
  }
};

export {};
