import { numberedFileName, uniqueFileName } from "@/lib/file-names";
import type { ConflictPolicy, QueueImage } from "@/lib/image-types";

type BrowserWritable = {
  write: (contents: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type BrowserFileHandle = {
  createWritable: () => Promise<BrowserWritable>;
};

type BrowserDirectoryHandle = {
  getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<BrowserDirectoryHandle>;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<BrowserFileHandle>;
};

type BrowserFileSystemWindow = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<BrowserFileHandle>;
};

type BrowserDownloadOptions = {
  chooseLocation?: boolean;
  conflictPolicy?: ConflictPolicy;
  onSkipped?: (id: string) => void;
  resolveConflict?: (name: string) => Promise<"rename" | "overwrite" | "skip" | "cancel">;
};

type ZipDownloadOptions = BrowserDownloadOptions & {
  subfolderName?: string;
};

function browserFileSystem() {
  return window as BrowserFileSystemWindow;
}

async function writeFileHandle(fileHandle: BrowserFileHandle, blob: Blob) {
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function normalizeFolderName(name: string) {
  const trimmed = name.trim();
  return trimmed && trimmed !== "." && trimmed !== ".." && !/[\\/]/.test(trimmed)
    ? trimmed
    : "imagens-compactadas";
}

export async function downloadBlob(
  blob: Blob,
  fileName: string,
  options: BrowserDownloadOptions = {}
) {
  const fileSystem = browserFileSystem();
  if (options.chooseLocation && fileSystem.showSaveFilePicker) {
    const fileHandle = await fileSystem.showSaveFilePicker({ suggestedName: fileName });
    await writeFileHandle(fileHandle, blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadImagesZip(images: QueueImage[], options: ZipDownloadOptions = {}) {
  const readyImages = images.filter((image) => image.compressedBlob && image.compressedName);

  if (!readyImages.length) {
    return false;
  }

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folderName = options.subfolderName ? normalizeFolderName(options.subfolderName) : undefined;
  const used = new Set<string>();
  readyImages.forEach((image) => {
    const fileName = folderName
      ? `${folderName}/${image.compressedName as string}`
      : image.compressedName as string;
    zip.file(uniqueFileName(fileName, used), image.compressedBlob as Blob);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  await downloadBlob(blob, "imagens-compactadas.zip", options);
  return true;
}

export async function downloadImagesIndividual(
  images: QueueImage[],
  options: ZipDownloadOptions = {}
) {
  const readyImages = images.filter((image) => image.compressedBlob && image.compressedName);
  if (!readyImages.length) {
    return [];
  }

  const fileSystem = browserFileSystem();
  if (options.chooseLocation && fileSystem.showDirectoryPicker) {
    let directory = await fileSystem.showDirectoryPicker();
    if (options.subfolderName) {
      directory = await directory.getDirectoryHandle(normalizeFolderName(options.subfolderName), { create: true });
    }

    const downloadedIds: string[] = [];
    for (const image of readyImages) {
      if (!image.compressedBlob || !image.compressedName) {
        continue;
      }
      let fileName = image.compressedName;
      const exists = async (name: string) => {
        try { await directory.getFileHandle(name, { create: false }); return true; }
        catch (error) { if (error instanceof DOMException && error.name === "NotFoundError") return false; throw error; }
      };
      if (await exists(fileName)) {
        let policy = options.conflictPolicy ?? "ask";
        if (policy === "ask") {
          const decision = await options.resolveConflict?.(fileName);
          if (!decision || decision === "cancel") throw new DOMException("Salvamento cancelado", "AbortError");
          policy = decision;
        }
        if (policy === "skip") { options.onSkipped?.(image.id); continue; }
        if (policy === "rename") {
          let index = 2;
          while (await exists(fileName)) fileName = numberedFileName(image.compressedName, index++);
        }
      }
      const fileHandle = await directory.getFileHandle(fileName, { create: true });
      await writeFileHandle(fileHandle, image.compressedBlob);
      downloadedIds.push(image.id);
    }
    return downloadedIds;
  }

  const downloadedIds: string[] = [];
  for (const image of readyImages) {
    if (!image.compressedBlob || !image.compressedName) {
      continue;
    }
    await downloadBlob(image.compressedBlob, image.compressedName, {
      chooseLocation: options.chooseLocation
    });
    downloadedIds.push(image.id);
  }
  return downloadedIds;
}
