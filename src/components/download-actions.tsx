"use client";

import { Download, Play, RotateCcw, Trash2 } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadImagesIndividual, downloadImagesZip } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DownloadActionsProps = {
  images: QueueImage[];
  isProcessing: boolean;
  isDesktop: boolean;
  onProcess: () => void;
  onClear: () => void;
  compact?: boolean;
};

export function DownloadActions({
  images,
  isProcessing,
  isDesktop,
  onProcess,
  onClear,
  compact = false
}: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = images.some((image) => image.compressedBlob);
  const hasProcessed = images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className={cn("grid gap-2", compact && "flex flex-wrap justify-end")}>
      <Button className={cn(!compact && "w-full")} size={compact ? "sm" : "default"} disabled={!hasImages || isProcessing} onClick={onProcess}>
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
            className={cn(!compact && "w-full")}
            size={compact ? "sm" : "default"}
            disabled={!hasCompressed || isProcessing}
            onClick={() => downloadImagesIndividual(images)}
          >
            <Download className="h-4 w-4" />
            Baixar individualmente
          </Button>
          <Button
            variant="outline"
            className={cn(!compact && "w-full")}
            size={compact ? "sm" : "default"}
            disabled={!hasCompressed || isProcessing}
            onClick={() => downloadImagesZip(images)}
          >
            <Download className="h-4 w-4" />
            Baixar ZIP
          </Button>
        </>
      ) : null}
      <Button
        className={cn("text-muted-foreground", !compact && "w-full")}
        variant="ghost"
        size={compact ? "sm" : "default"}
        disabled={!hasImages || isProcessing}
        onClick={onClear}
      >
        <Trash2 className="h-4 w-4" />
        Limpar tudo
      </Button>
    </div>
  );
}
