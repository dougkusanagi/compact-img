import type { OutputFormat } from "@/lib/utils";

export type ImageStatus = "pending" | "processing" | "done" | "error";
export type JpegCompressionMode = "fast" | "balanced" | "max";

export type CompressionSettings = {
  preserveOriginalDimensions: boolean;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  outputFormat: OutputFormat;
  jpegCompressionMode: JpegCompressionMode;
  keepAspectRatio: boolean;
  stripMetadata: boolean;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type DownloadMode = "same-folder" | "choose-location";

export type DownloadPreferences = {
  mode: DownloadMode;
  autoDownload: boolean;
  removeAfterDownload: boolean;
  saveInSubfolder: boolean;
  subfolderName: string;
};

export type QueueSummary = {
  totalCount: number;
  completedCount: number;
  errorCount: number;
  averageReduction?: number;
};

export type QueueImage = {
  id: string;
  file: File;
  sourcePath?: string;
  originalUrl: string;
  compressedUrl?: string;
  compressedBlob?: Blob;
  compressedName?: string;
  savedPath?: string;
  originalDimensions?: ImageDimensions;
  finalDimensions?: ImageDimensions;
  status: ImageStatus;
  error?: string;
  downloadError?: string;
};

export type SelectedImage = {
  file: File;
  sourcePath?: string;
};

export type WorkerRequest = {
  id: string;
  file: File;
  settings: CompressionSettings;
};

export type WorkerResponse = {
  id: string;
  blob?: Blob;
  originalDimensions?: ImageDimensions;
  finalDimensions?: ImageDimensions;
  error?: string;
};
