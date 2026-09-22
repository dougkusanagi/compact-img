"use client";

import { Download, Play, RotateCcw, Trash2, X } from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadImagesIndividual, downloadImagesZip } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DownloadActionsProps = {
  images: QueueImage[];
  isProcessing: boolean;
  isDesktop: boolean;
  onProcess: () => void;
  onCancelProcess: () => void;
  onClear: () => void;
  onDownloadAllDesktop: () => void | Promise<void>;
  hasCompressed?: boolean;
  hasProcessed?: boolean;
  isCancelRequested?: boolean;
  compact?: boolean;
};

export function DownloadActions({
  images,
  isProcessing,
  isDesktop,
  onProcess,
  onCancelProcess,
  onClear,
  onDownloadAllDesktop,
  hasCompressed: hasCompressedProp,
  hasProcessed: hasProcessedProp,
  isCancelRequested = false,
  compact = false
}: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = hasCompressedProp ?? images.some((image) => image.compressedBlob && image.status === "done");
  const hasProcessed = hasProcessedProp ?? images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className={cn("w-full", compact && "w-full")}>
      <div className={cn("grid w-full gap-2", isDesktop ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
        {isProcessing ? (
          <Button
            className={cn("h-[4.5rem] w-full", !compact && "w-full")}
            size={compact ? "sm" : "default"}
            variant="destructive"
            disabled={isCancelRequested}
            onClick={() => {
              if (isCancelRequested) {
                return;
              }

              const confirmed = window.confirm(
                "Cancelar o processamento agora? A imagem atual pode terminar antes da interrupcao."
              );

              if (confirmed) {
                onCancelProcess();
              }
            }}
          >
            {isCancelRequested ? <RotateCcw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {isCancelRequested ? "Cancelando..." : "Cancelar"}
          </Button>
        ) : (
          <Button className={cn("h-[4.5rem] w-full", !compact && "w-full")} size={compact ? "sm" : "default"} disabled={!hasImages} onClick={onProcess}>
            {hasProcessed ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {hasProcessed ? "Reprocessar" : "Compactar"}
          </Button>
        )}
        {isDesktop ? (
          <Button
            variant="outline"
            className={cn("h-[4.5rem] w-full", !compact && "w-full")}
            size={compact ? "sm" : "default"}
            disabled={!hasCompressed || isProcessing}
            onClick={onDownloadAllDesktop}
          >
            <Download className="h-4 w-4" />
            Baixar todas
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              className={cn("h-[4.5rem] w-full", !compact && "w-full")}
              size={compact ? "sm" : "default"}
              disabled={!hasCompressed || isProcessing}
              onClick={() => downloadImagesIndividual(images)}
            >
              <Download className="h-4 w-4" />
              Baixar individual
            </Button>
            <Button
              variant="outline"
              className={cn("h-[4.5rem] w-full", !compact && "w-full")}
              size={compact ? "sm" : "default"}
              disabled={!hasCompressed || isProcessing}
              onClick={() => downloadImagesZip(images)}
            >
              <Download className="h-4 w-4" />
              Baixar ZIP
            </Button>
          </>
        )}
        <Button
          className={cn("h-[4.5rem] w-full text-muted-foreground", !compact && "w-full")}
          variant="ghost"
          size={compact ? "sm" : "default"}
          disabled={!hasImages || isProcessing}
          onClick={onClear}
        >
          <Trash2 className="h-4 w-4" />
          Limpar tudo
        </Button>
      </div>
    </div>
  );
}
