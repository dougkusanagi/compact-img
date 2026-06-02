import type { WorkerRequest, WorkerResponse } from "@/lib/image-types";

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif"
} as const;

function getTargetDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  keepAspectRatio: boolean
) {
  if (!keepAspectRatio) {
    return {
      width: Math.max(1, Math.min(maxWidth, width)),
      height: Math.max(1, Math.min(maxHeight, height))
    };
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

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
    const finalDimensions = getTargetDimensions(
      originalDimensions.width,
      originalDimensions.height,
      settings.maxWidth,
      settings.maxHeight,
      settings.keepAspectRatio
    );

    const canvas = new OffscreenCanvas(finalDimensions.width, finalDimensions.height);
    const context = canvas.getContext("2d", { alpha: settings.outputFormat !== "jpeg" });

    if (!context) {
      bitmap.close();
      throw new Error("Nao foi possivel criar o contexto de desenho.");
    }

    if (settings.outputFormat === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, finalDimensions.width, finalDimensions.height);
    }

    context.drawImage(bitmap, 0, 0, finalDimensions.width, finalDimensions.height);
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: MIME_BY_FORMAT[settings.outputFormat],
      quality: settings.outputFormat === "png" ? undefined : settings.quality / 100
    });

    if (blob.type !== MIME_BY_FORMAT[settings.outputFormat] && settings.outputFormat === "avif") {
      throw new Error("Seu navegador nao conseguiu gerar AVIF. Tente JPG, WEBP ou PNG.");
    }

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
