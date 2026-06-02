import type { OutputFormat } from "@/lib/utils";

export type ImageStatus = "pending" | "processing" | "done" | "error";

export type CompressionSettings = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  outputFormat: OutputFormat;
  keepAspectRatio: boolean;
  stripMetadata: boolean;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export type QueueImage = {
  id: string;
  file: File;
  originalUrl: string;
  compressedUrl?: string;
  compressedBlob?: Blob;
  compressedName?: string;
  originalDimensions?: ImageDimensions;
  finalDimensions?: ImageDimensions;
  status: ImageStatus;
  error?: string;
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
