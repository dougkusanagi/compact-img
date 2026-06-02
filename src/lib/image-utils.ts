import type { ImageDimensions } from "@/lib/image-types";

export const ACCEPTED_IMAGE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"]
};

export const ACCEPTED_MIME_TYPES = Object.keys(ACCEPTED_IMAGE_TYPES);

export function isAcceptedImage(file: File) {
  return ACCEPTED_MIME_TYPES.includes(file.type);
}

export function createImageId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}
