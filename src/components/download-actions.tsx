"use client";

import { Download, Play, RotateCcw, Trash2 } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadImagesZip } from "@/lib/download";
import { Button } from "@/components/ui/button";

type DownloadActionsProps = {
  images: QueueImage[];
  isProcessing: boolean;
  onProcess: () => void;
  onClear: () => void;
};

export function DownloadActions({ images, isProcessing, onProcess, onClear }: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = images.some((image) => image.compressedBlob);
  const hasProcessed = images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button disabled={!hasImages || isProcessing} onClick={onProcess}>
        {hasProcessed ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {hasProcessed ? "Reprocessar lote" : "Compactar lote"}
      </Button>
      <Button
        variant="outline"
        disabled={!hasCompressed || isProcessing}
        onClick={() => downloadImagesZip(images)}
      >
        <Download className="h-4 w-4" />
        Baixar ZIP
      </Button>
      <Button variant="ghost" disabled={!hasImages || isProcessing} onClick={onClear}>
        <Trash2 className="h-4 w-4" />
        Limpar tudo
      </Button>
    </div>
  );
}
