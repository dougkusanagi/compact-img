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
  hasCompressed?: boolean;
  hasProcessed?: boolean;
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
  hasCompressed: hasCompressedProp,
  hasProcessed: hasProcessedProp,
  compact = false
}: DownloadActionsProps) {
  const hasImages = images.length > 0;
  const hasCompressed = hasCompressedProp ?? images.some((image) => image.compressedBlob && image.status === "done");
  const hasProcessed = hasProcessedProp ?? images.some((image) => image.status === "done" || image.status === "error");

  return (
    <div className={cn("grid gap-2", compact && "flex flex-wrap items-end justify-between gap-x-3 gap-y-2 w-full")}>
      {isDesktop ? (
        <div className="flex flex-col gap-1 flex-1 min-w-[160px] max-w-[280px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 pl-0.5">
            Destino do download
          </label>
          <Select value={downloadMode} onValueChange={(value) => onDownloadModeChange(value as DownloadMode)}>
            <SelectTrigger className={cn("w-full", compact && "h-9")} disabled={isProcessing}>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Destino" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same-folder">Mesma pasta</SelectItem>
              <SelectItem value="choose-location">Escolher local</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <Button className={cn(!compact && "w-full")} size={compact ? "sm" : "default"} disabled={!hasImages || isProcessing} onClick={onProcess}>
          {hasProcessed ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {hasProcessed ? "Reprocessar" : "Compactar"}
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
              Baixar individual
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
    </div>
  );
}
