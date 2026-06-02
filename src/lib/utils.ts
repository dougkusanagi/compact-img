import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

export function getReduction(originalSize: number, compressedSize?: number) {
  if (!compressedSize || originalSize <= 0) {
    return undefined;
  }

  return Math.max(0, ((originalSize - compressedSize) / originalSize) * 100);
}

export function getExtension(format: OutputFormat) {
  return format === "jpeg" ? "jpg" : format;
}

export function replaceExtension(name: string, format: OutputFormat) {
  const baseName = name.replace(/\.[^.]+$/, "");
  return `${baseName}-compactado.${getExtension(format)}`;
}

export type OutputFormat = "jpeg" | "webp" | "png" | "avif";
