import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { SelectedImage } from "@/lib/image-types";

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

export async function saveCompressedImage(sourcePath: string, fileName: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return invoke<string>("save_compressed_image", bytes, {
    headers: {
      "x-source-path": encodeURIComponent(sourcePath),
      "x-file-name": encodeURIComponent(fileName)
    }
  });
}
