"use client";

import { Download, Play, RotateCcw, Trash2 } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadImagesIndividual, downloadImagesZip } from "@/lib/download";
import { Button } from "@/components/ui/button";

type DownloadActionsProps = {
  images: QueueImage[];
  isProcessing: boolean;
  isDesktop: boolean;
  onProcess: () => void;
  onClear: () => void;
};

export function DownloadActions({ images, isProcessing, isDesktop, onProcess, onClear }: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = images.some((image) => image.compressedBlob);
  const hasProcessed = images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className="grid gap-2">
      <Button className="w-full" disabled={!hasImages || isProcessing} onClick={onProcess}>
        {hasProcessed ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {hasProcessed
          ? isDesktop
            ? "Reprocessar e salvar"
            : "Reprocessar lote"
          : isDesktop
            ? "Compactar e salvar"
            : "Compactar lote"}
      </Button>
      {!isDesktop ? (
        <>
          <Button
            variant="outline"
            className="w-full"
            disabled={!hasCompressed || isProcessing}
            onClick={() => downloadImagesIndividual(images)}
          >
            <Download className="h-4 w-4" />
            Baixar individualmente
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={!hasCompressed || isProcessing}
            onClick={() => downloadImagesZip(images)}
          >
            <Download className="h-4 w-4" />
            Baixar ZIP
          </Button>
        </>
      ) : null}
      <Button className="w-full text-muted-foreground" variant="ghost" disabled={!hasImages || isProcessing} onClick={onClear}>
        <Trash2 className="h-4 w-4" />
        Limpar tudo
      </Button>
    </div>
  );
}
