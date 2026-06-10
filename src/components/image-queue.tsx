"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  HardDrive,
  LoaderCircle,
  Trash2
} from "lucide-react";
import type { QueueImage } from "@/lib/image-types";
import { downloadBlob } from "@/lib/download";
import { formatBytes, formatPercent, getReduction } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import { DownloadActions } from "@/components/download-actions";
import { ProgressBar } from "@/components/progress-bar";

type ImageQueueProps = {
  images: QueueImage[];
  selectedId?: string;
  isProcessing?: boolean;
  isDesktop?: boolean;
  progress: number;
  processedCount: number;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onProcess: () => void;
  onClear: () => void;
};

const STATUS_CONFIG: Record<
  QueueImage["status"],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  pending: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground",
    icon: Clock3
  },
  processing: {
    label: "Processando",
    className: "bg-primary/10 text-primary",
    icon: LoaderCircle
  },
  done: {
    label: "Concluída",
    className: "bg-emerald-50 text-emerald-700",
    icon: CheckCircle2
  },
  error: {
    label: "Erro",
    className: "bg-destructive/10 text-destructive",
    icon: AlertCircle
  }
};

export function ImageQueue({
  images,
  selectedId,
  isProcessing = false,
  isDesktop = false,
  progress,
  processedCount,
  onSelect,
  onRemove,
  onProcess,
  onClear
}: ImageQueueProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex items-center gap-3">
          <div>
            <CardTitle>Suas imagens</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Acompanhe e compare cada resultado</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {images.length}
          </span>
        </div>
        <DownloadActions
          images={images}
          isProcessing={isProcessing}
          isDesktop={isDesktop}
          onProcess={onProcess}
          onClear={onClear}
          compact
        />
      </CardHeader>
      {isProcessing ? (
        <div className="border-b px-6 py-3">
          <ProgressBar value={progress} label={`${processedCount} de ${images.length} imagens processadas`} />
        </div>
      ) : null}
      <CardContent className="p-0">
        {images.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Eye className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold">Nenhuma imagem adicionada</p>
            <p className="mt-1 text-xs text-muted-foreground">Seus arquivos aparecerão aqui.</p>
          </div>
        ) : (
          <div className="divide-y">
            {images.map((image) => {
              const reduction = getReduction(image.file.size, image.compressedBlob?.size);
              const isPreviewOpen = previewId === image.id;
              const status = STATUS_CONFIG[image.status];
              const StatusIcon = status.icon;

              return (
                <article
                  key={image.id}
                  className={cn(
                    "transition-colors duration-200",
                    selectedId === image.id ? "bg-primary/[0.025]" : "hover:bg-muted/20"
                  )}
                >
                  <div
                    className="grid cursor-pointer gap-4 p-4 sm:grid-cols-[84px_minmax(0,1fr)_auto] sm:items-center"
                    onClick={() => onSelect(image.id)}
                  >
                    <div className="relative h-20 w-full overflow-hidden rounded-md bg-muted sm:w-[84px]">
                      <img src={image.originalUrl} alt={image.file.name} className="h-full w-full object-cover" />
                      {image.status === "done" ? (
                        <div className="absolute bottom-1.5 right-1.5 rounded-full bg-emerald-500 p-1 text-white shadow">
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="max-w-full truncate text-sm font-bold" title={image.file.name}>
                          {image.file.name}
                        </p>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            status.className
                          )}
                        >
                          <StatusIcon
                            className={cn("h-3 w-3", image.status === "processing" && "animate-spin")}
                          />
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatBytes(image.file.size)}</span>
                        <span>
                          {image.originalDimensions
                            ? `${image.originalDimensions.width} × ${image.originalDimensions.height}px`
                            : "Lendo dimensões..."}
                        </span>
                        {image.compressedBlob ? (
                          <span className="font-medium text-foreground">
                            {formatBytes(image.compressedBlob.size)}
                          </span>
                        ) : null}
                        {reduction !== undefined ? (
                          <span className="font-bold text-emerald-700">{formatPercent(reduction)} menor</span>
                        ) : null}
                      </div>

                      {image.error ? <p className="mt-2 text-xs text-destructive">{image.error}</p> : null}
                      {image.savedPath ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" title={image.savedPath}>
                          <HardDrive className="h-3 w-3" />
                          Salva na pasta original
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant={isPreviewOpen ? "secondary" : "outline"}
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewId(isPreviewOpen ? null : image.id);
                        }}
                        aria-label="Visualizar comparação"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden md:inline">Comparar</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isPreviewOpen && "rotate-180")} />
                      </Button>
                      {!isDesktop ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={!image.compressedBlob || !image.compressedName}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (image.compressedBlob && image.compressedName) {
                              downloadBlob(image.compressedBlob, image.compressedName);
                            }
                          }}
                          aria-label="Baixar imagem"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={isProcessing}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(image.id);
                          if (isPreviewOpen) {
                            setPreviewId(null);
                          }
                        }}
                        aria-label="Remover imagem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isPreviewOpen ? (
                    <div className="animate-in slide-in-from-top-2 border-t bg-muted/25 p-4 duration-300 sm:p-5">
                      <div className="mx-auto max-w-3xl">
                        <BeforeAfterSlider
                          beforeUrl={image.originalUrl}
                          afterUrl={image.compressedUrl}
                          alt={image.file.name}
                        />
                        <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <p className="text-xs text-muted-foreground">
                            {image.status === "done"
                              ? "Arraste o controle para comparar o original e o resultado."
                              : "Compacte a imagem para visualizar a comparação."}
                          </p>
                          {!isDesktop && image.compressedBlob && image.compressedName ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadBlob(image.compressedBlob as Blob, image.compressedName as string)}
                            >
                              <Download className="h-4 w-4" />
                              Baixar imagem
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
