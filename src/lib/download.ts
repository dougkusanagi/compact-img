import JSZip from "jszip";
import type { QueueImage } from "@/lib/image-types";

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadImagesZip(images: QueueImage[]) {
  const zip = new JSZip();
  const readyImages = images.filter((image) => image.compressedBlob && image.compressedName);

  readyImages.forEach((image) => {
    zip.file(image.compressedName as string, image.compressedBlob as Blob);
  });

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "imagens-compactadas.zip");
}
