"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FolderDown,
  LoaderCircle,
  ScanSearch,
  Trash2
} from "lucide-react";
import type { DownloadMode, QueueImage } from "@/lib/image-types";
import { downloadBlob } from "@/lib/download";
import { cn, formatBytes, formatPercent, getReduction } from "@/lib/utils";
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
  downloadMode: DownloadMode;
  progress: number;
  processedCount: number;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onProcess: () => void;
  onClear: () => void;
  onDownload: (id: string) => void | Promise<void>;
  onDownloadAllDesktop: () => void | Promise<void>;
  onDownloadModeChange: (mode: DownloadMode) => void;
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
    label: "Concluida",
    className: "bg-emerald-50 text-emerald-700",
    icon: CheckCircle2
  },
  error: {
    label: "Erro",
    className: "bg-destructive/10 text-destructive",
    icon: AlertCircle
  }
};

function formatDimensionDelta(value: number) {
  if (value === 0) {
    return "0 px";
  }

  return `${value > 0 ? "+" : ""}${value}px`;
}

type MetricBadgeProps = {
  label: string;
  value: string;
  tone?: "default" | "success";
};

function MetricBadge({ label, value, tone = "default" }: MetricBadgeProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        tone === "success" ? "border-emerald-200 bg-emerald-50" : "bg-muted/35"
      )}
    >
      <p
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.12em]",
          tone === "success" ? "text-emerald-700" : "text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function ImageQueue({
  images,
  selectedId,
  isProcessing = false,
  isDesktop = false,
  downloadMode,
  progress,
  processedCount,
  onSelect,
  onRemove,
  onProcess,
  onClear,
  onDownload,
  onDownloadAllDesktop,
  onDownloadModeChange
}: ImageQueueProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const completedCount = images.filter((image) => image.status === "done").length;
  const errorCount = images.filter((image) => image.status === "error").length;
  const averageReduction = images
    .map((image) => getReduction(image.file.size, image.compressedBlob?.size))
    .filter((value): value is number => value !== undefined);

  return (
    <Card className="overflow-hidden border-border/70 shadow-[0_18px_45px_hsl(222_45%_13%/0.06)]">
      <CardHeader className="space-y-4 border-b bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--muted)/0.38)_100%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner shadow-primary/10">
              <ScanSearch className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Suas imagens</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Acompanhe o lote, compare ganhos e baixe so quando fizer sentido.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-semibold text-foreground">
              {images.length} {images.length === 1 ? "item" : "itens"}
            </span>
            {completedCount > 0 ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {completedCount} concluidas
              </span>
            ) : null}
            {errorCount > 0 ? (
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                {errorCount} com erro
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricBadge label="Na fila" value={String(images.length)} />
            <MetricBadge label="Concluidas" value={String(completedCount)} />
            <MetricBadge
              label="Reducao media"
              value={
                averageReduction.length
                  ? formatPercent(averageReduction.reduce((sum, value) => sum + value, 0) / averageReduction.length)
                  : "--"
              }
              tone="success"
            />
          </div>
          <DownloadActions
            images={images}
            isProcessing={isProcessing}
            isDesktop={isDesktop}
            downloadMode={downloadMode}
            onProcess={onProcess}
            onClear={onClear}
            onDownloadAllDesktop={onDownloadAllDesktop}
            onDownloadModeChange={onDownloadModeChange}
            compact
          />
        </div>
      </CardHeader>

      {isProcessing ? (
        <div className="border-b bg-muted/30 px-6 py-3">
          <ProgressBar value={progress} label={`${processedCount} de ${images.length} imagens processadas`} />
        </div>
      ) : null}

      <CardContent className="p-0">
        {images.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FolderDown className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold">Nenhuma imagem adicionada</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Assim que voce enviar arquivos, este painel mostra status, comparativos e downloads por imagem.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {images.map((image) => {
              const reduction = getReduction(image.file.size, image.compressedBlob?.size);
              const isPreviewOpen = previewId === image.id;
              const status = STATUS_CONFIG[image.status];
              const StatusIcon = status.icon;
              const hasCompressed = Boolean(image.compressedBlob && image.compressedName);
              const widthDiff = image.originalDimensions && image.finalDimensions
                ? image.finalDimensions.width - image.originalDimensions.width
                : undefined;
              const heightDiff = image.originalDimensions && image.finalDimensions
                ? image.finalDimensions.height - image.originalDimensions.height
                : undefined;
              const sizeDiff = image.compressedBlob ? image.compressedBlob.size - image.file.size : undefined;

              return (
                <article
                  key={image.id}
                  className={cn(
                    "transition-all duration-200",
                    selectedId === image.id ? "bg-primary/[0.03]" : "hover:bg-muted/20"
                  )}
                >
                  <div
                    className="grid cursor-pointer gap-4 p-4 sm:grid-cols-[92px_minmax(0,1fr)] xl:grid-cols-[92px_minmax(0,1fr)_220px]"
                    onClick={() => onSelect(image.id)}
                  >
                    <div className="relative h-24 w-full overflow-hidden rounded-xl border bg-muted sm:w-[92px]">
                      <img src={image.originalUrl} alt={image.file.name} className="h-full w-full object-cover" />
                      {image.status === "done" ? (
                        <div className="absolute bottom-2 right-2 rounded-full bg-emerald-500 p-1 text-white shadow">
                          <CheckCircle2 className="h-3 w-3" />
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground" title={image.file.name}>
                            {image.file.name}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Clique para selecionar e use comparar para abrir o preview.
                          </p>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            status.className
                          )}
                        >
                          <StatusIcon className={cn("h-3 w-3", image.status === "processing" && "animate-spin")} />
                          {status.label}
                        </span>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2 2xl:grid-cols-4">
                        <MetricBadge label="Original" value={formatBytes(image.file.size)} />
                        <MetricBadge
                          label="Dimensoes"
                          value={
                            image.originalDimensions
                              ? `${image.originalDimensions.width} × ${image.originalDimensions.height}px`
                              : "Lendo dimensoes..."
                          }
                        />
                        {image.compressedBlob ? (
                          <MetricBadge label="Compactada" value={formatBytes(image.compressedBlob.size)} tone="success" />
                        ) : null}
                        {image.finalDimensions ? (
                          <MetricBadge
                            label="Dimensoes finais"
                            value={`${image.finalDimensions.width} × ${image.finalDimensions.height}px`}
                            tone="success"
                          />
                        ) : null}
                        {sizeDiff !== undefined ? (
                          <MetricBadge
                            label="Diferenca"
                            value={`${sizeDiff < 0 ? "-" : "+"}${formatBytes(Math.abs(sizeDiff))}`}
                            tone="success"
                          />
                        ) : null}
                        {reduction !== undefined ? (
                          <MetricBadge label="Reducao" value={formatPercent(reduction)} tone="success" />
                        ) : null}
                        {widthDiff !== undefined ? (
                          <MetricBadge label="Largura" value={formatDimensionDelta(widthDiff)} />
                        ) : null}
                        {heightDiff !== undefined ? (
                          <MetricBadge label="Altura" value={formatDimensionDelta(heightDiff)} />
                        ) : null}
                      </div>

                      {image.error ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {image.error}
                        </div>
                      ) : null}
                      {image.downloadError ? (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                          {image.downloadError}
                        </div>
                      ) : null}
                      {image.savedPath ? (
                        <div className="rounded-xl border bg-muted/25 px-3 py-2 text-xs text-muted-foreground" title={image.savedPath}>
                          Baixada em: {image.savedPath}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-2 xl:flex-col xl:items-stretch">
                      <Button
                        variant={isPreviewOpen ? "secondary" : "outline"}
                        size="sm"
                        className="xl:justify-between"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewId(isPreviewOpen ? null : image.id);
                        }}
                        aria-label="Visualizar comparacao"
                      >
                        <span>Comparar</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isPreviewOpen && "rotate-180")} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasCompressed}
                        className="xl:justify-between"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isDesktop) {
                            void onDownload(image.id);
                            return;
                          }

                          if (image.compressedBlob && image.compressedName) {
                            downloadBlob(image.compressedBlob, image.compressedName);
                          }
                        }}
                        aria-label="Baixar imagem"
                      >
                        <Download className="h-4 w-4" />
                        <span>Baixar</span>
                      </Button>
                      {!isDesktop ? null : (
                        <span className="hidden rounded-lg bg-muted/45 px-2 py-1 text-center text-[11px] text-muted-foreground xl:inline">
                          {downloadMode === "same-folder" ? "Mesma pasta" : "Escolher local"}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive xl:justify-between"
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
                        <span>Remover</span>
                      </Button>
                    </div>
                  </div>

                  {isPreviewOpen ? (
                    <div className="animate-in slide-in-from-top-2 border-t bg-[linear-gradient(180deg,hsl(var(--muted)/0.28)_0%,hsl(var(--background))_100%)] p-4 duration-300 sm:p-5">
                      <div className="mx-auto max-w-3xl">
                        <BeforeAfterSlider
                          beforeUrl={image.originalUrl}
                          afterUrl={image.compressedUrl}
                          alt={image.file.name}
                        />
                        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <p className="text-xs text-muted-foreground">
                            {image.status === "done"
                              ? "Arraste o controle para comparar o original e o resultado."
                              : "Compacte a imagem para visualizar a comparacao."}
                          </p>
                          {image.compressedBlob && image.compressedName ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (isDesktop) {
                                  void onDownload(image.id);
                                  return;
                                }

                                downloadBlob(image.compressedBlob as Blob, image.compressedName as string);
                              }}
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
