import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { CompressionSettings, WorkerResponse, SelectedImage } from "@/lib/image-types";

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function getMimeType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function isAcceptedImagePath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return extension in MIME_BY_EXTENSION;
}

export function isDesktopApp() {
  return isTauri();
}

export async function loadImagesFromPaths(paths: string[]): Promise<SelectedImage[]> {
  return Promise.all(
    paths.map(async (sourcePath) => {
      const contents = await invoke<ArrayBuffer>("read_image", { path: sourcePath });
      const file = new File([contents], getFileName(sourcePath), {
        type: getMimeType(sourcePath)
      });

      return { file, sourcePath };
    })
  );
}

export async function selectDesktopImages() {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Imagens",
        extensions: ["jpg", "jpeg", "png", "webp", "avif"]
      }
    ]
  });

  if (!selected) {
    return [];
  }

  return loadImagesFromPaths(Array.isArray(selected) ? selected : [selected]);
}

type SaveCompressedImageInput = {
  blob: Blob;
  fileName: string;
  sourcePath?: string;
  destinationPath?: string;
};

type NativeJpegCompressionInput = {
  id: string;
  sourcePath: string;
  settings: CompressionSettings;
};

function parseNativeJpegCompressionPayload(payload: ArrayBuffer) {
  const bytes = new Uint8Array(payload);
  const headerEnd = bytes.indexOf(10);

  if (headerEnd <= 0) {
    throw new Error("Resposta invalida da compressao nativa.");
  }

  const header = new TextDecoder().decode(bytes.subarray(0, headerEnd));
  const [originalWidth, originalHeight, finalWidth, finalHeight] = header
    .split(",")
    .map((value) => Number.parseInt(value, 10));

  if ([originalWidth, originalHeight, finalWidth, finalHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Dimensoes invalidas na resposta da compressao nativa.");
  }

  return {
    contents: bytes.subarray(headerEnd + 1),
    originalDimensions: {
      width: originalWidth,
      height: originalHeight
    },
    finalDimensions: {
      width: finalWidth,
      height: finalHeight
    }
  };
}

export function buildSiblingDestinationPath(sourcePath: string, fileName: string) {
  const segments = sourcePath.split(/[\\/]/);
  segments.pop();
  return [...segments, fileName].join(getPathSeparator(sourcePath));
}

export function normalizeSubfolderName(value: string) {
  const trimmed = value.trim();
  return trimmed && trimmed !== "." && trimmed !== ".." && !/[\\/]/.test(trimmed)
    ? trimmed
    : "imagens-compactadas";
}

export function isValidSubfolderName(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== "." && normalized !== ".." && !/[\\/]/.test(normalized);
}

export function buildSubfolderDestinationPath(sourcePath: string, subfolderName: string, fileName: string) {
  const segments = sourcePath.split(/[\\/]/);
  segments.pop();
  return [...segments, normalizeSubfolderName(subfolderName), fileName].join(getPathSeparator(sourcePath));
}

function getPathSeparator(path: string) {
  return path.includes("\\") ? "\\" : "/";
}

export async function chooseSavePath(sourcePath: string | undefined, fileName: string) {
  return save({
    title: "Salvar imagem compactada",
    filters: [
      {
        name: "Imagens",
        extensions: [fileName.split(".").pop()?.toLowerCase() ?? "webp"]
      }
    ],
    defaultPath: sourcePath ? buildSiblingDestinationPath(sourcePath, fileName) : fileName
  });
}

export async function chooseDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Escolher pasta para salvar imagens"
  });

  return Array.isArray(selected) ? selected[0] : selected;
}

export function joinPath(directory: string, fileName: string) {
  const isWindows = directory.includes("\\") || !directory.includes("/");
  const separator = isWindows ? "\\" : "/";
  const base = directory.endsWith(separator) ? directory.slice(0, -1) : directory;
  return `${base}${separator}${fileName}`;
}

export async function saveCompressedImage({
  blob,
  fileName,
  sourcePath,
  destinationPath
}: SaveCompressedImageInput) {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return invoke<string>("save_compressed_image", bytes, {
    headers: {
      "x-file-name": encodeURIComponent(fileName),
      ...(sourcePath ? { "x-source-path": encodeURIComponent(sourcePath) } : {}),
      ...(destinationPath ? { "x-destination-path": encodeURIComponent(destinationPath) } : {})
    }
  });
}

export async function compressNativeJpeg({
  id,
  sourcePath,
  settings
}: NativeJpegCompressionInput): Promise<WorkerResponse> {
  const payload = await invoke<ArrayBuffer>("compress_jpeg_image", {
    sourcePath,
    settings
  });
  const result = parseNativeJpegCompressionPayload(payload);

  return {
    id,
    blob: new Blob([result.contents], { type: "image/jpeg" }),
    originalDimensions: result.originalDimensions,
    finalDimensions: result.finalDimensions
  };
}
