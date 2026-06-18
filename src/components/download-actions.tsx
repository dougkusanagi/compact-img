"use client";

import { Download, FolderOpen, Play, RotateCcw, Trash2 } from "lucide-react";
import type { DownloadMode, QueueImage } from "@/lib/image-types";
import { downloadImagesIndividual, downloadImagesZip } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DownloadActionsProps = {
  images: QueueImage[];
  isProcessing: boolean;
  isDesktop: boolean;
  downloadMode: DownloadMode;
  onProcess: () => void;
  onClear: () => void;
  onDownloadAllDesktop: () => void | Promise<void>;
  onDownloadModeChange: (mode: DownloadMode) => void;
  compact?: boolean;
};

export function DownloadActions({
  images,
  isProcessing,
  isDesktop,
  downloadMode,
  onProcess,
  onClear,
  onDownloadAllDesktop,
  onDownloadModeChange,
  compact = false
}: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = images.some((image) => image.compressedBlob && image.status === "done");
  const hasProcessed = images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className={cn("grid gap-2", compact && "flex flex-wrap justify-end")}>
      {isDesktop ? (
        <Select value={downloadMode} onValueChange={(value) => onDownloadModeChange(value as DownloadMode)}>
          <SelectTrigger className={cn("min-w-52", compact && "h-9 w-auto")} disabled={isProcessing}>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              <SelectValue placeholder="Destino do download" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="same-folder">Baixar na mesma pasta</SelectItem>
            <SelectItem value="choose-location">Escolher local ao baixar</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      <Button className={cn(!compact && "w-full")} size={compact ? "sm" : "default"} disabled={!hasImages || isProcessing} onClick={onProcess}>
        {hasProcessed ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {hasProcessed ? "Reprocessar lote" : "Compactar lote"}
      </Button>
      {isDesktop ? (
        <Button
          variant="outline"
          className={cn(!compact && "w-full")}
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
      )}
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
