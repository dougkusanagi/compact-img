"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
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
    label: "Concluída",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2
  },
  error: {
    label: "Erro",
    className: "bg-destructive/10 text-destructive",
    icon: AlertCircle
  }
};

type MetricBadgeProps = {
  label: string;
  value: string;
  tone?: "default" | "success";
};

function MetricBadge({ label, value, tone = "default" }: MetricBadgeProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 transition-all duration-300",
        tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/[0.03] shadow-[0_2px_8px_rgba(16,185,129,0.03)]"
          : "border-border/50 bg-muted/20"
      )}
    >
      <p
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          tone === "success" ? "text-emerald-600" : "text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-foreground sm:text-base">{value}</p>
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
    <Card className="overflow-hidden border-border/60 shadow-[0_12px_38px_rgba(0,0,0,0.04)]">
      {images.length > 0 && (
        <CardHeader className="space-y-4 border-b bg-card p-5">
          {/* Linha 1: Título, Subtítulo e Badges do Lote */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary shadow-sm flex-shrink-0">
                <ScanSearch className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">Fila de compactação</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Acompanhe e compare os ganhos do lote antes de baixar.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:self-start">
              <span className="rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {images.length} {images.length === 1 ? "item" : "itens"}
              </span>
              {completedCount > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {completedCount} concluídas
                </span>
              )}
              {errorCount > 0 && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                  {errorCount} com erro
                </span>
              )}
            </div>
          </div>

          {/* Linha 2: Métricas Gerais (Largura Total) */}
          <div className="grid gap-3 grid-cols-3 border-t border-border/40 pt-4">
            <MetricBadge label="Na fila" value={String(images.length)} />
            <MetricBadge label="Concluídas" value={String(completedCount)} />
            <MetricBadge
              label="Redução Média"
              value={
                averageReduction.length
                  ? formatPercent(averageReduction.reduce((sum, value) => sum + value, 0) / averageReduction.length)
                  : "--"
              }
              tone="success"
            />
          </div>

          {/* Linha 3: Controles e Ações em Lote */}
          <div className="border-t border-border/40 pt-3 flex w-full">
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
      )}

      {isProcessing && (
        <div className="border-b bg-muted/20 px-6 py-3">
          <ProgressBar value={progress} label={`${processedCount} de ${images.length} imagens processadas`} />
        </div>
      )}

      <CardContent className="p-0">
        {images.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center p-8 text-center bg-card">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground/85">
              <FolderDown className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nenhuma imagem adicionada</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Adicione arquivos acima para acompanhar o status, comparar visualmente e baixar os resultados.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 bg-card">
            {images.map((image) => {
              const reduction = getReduction(image.file.size, image.compressedBlob?.size);
              const isPreviewOpen = previewId === image.id;
              const status = STATUS_CONFIG[image.status];
              const StatusIcon = status.icon;
              const hasCompressed = Boolean(image.compressedBlob && image.compressedName);

              return (
                <article
                  key={image.id}
                  className={cn(
                    "transition-all duration-200 border-l-2",
                    selectedId === image.id
                      ? "border-primary bg-primary/[0.015]"
                      : "border-transparent hover:bg-muted/15"
                  )}
                >
                  <div
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                    onClick={() => onSelect(image.id)}
                  >
                    {/* Bloco da esquerda: Thumbnail e informações */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {/* Thumbnail com status overlay */}
                      <div className="relative h-16 w-16 flex-shrink-0 rounded-xl overflow-hidden border bg-muted shadow-sm group">
                        <img
                          src={image.originalUrl}
                          alt={image.file.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {image.status === "done" && (
                          <div className="absolute right-1 top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-1 ring-white">
                            <CheckCircle2 className="h-3 w-3" />
                          </div>
                        )}
                        {image.status === "processing" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
                            <LoaderCircle className="h-5 w-5 animate-spin text-white" />
                          </div>
                        )}
                        {image.status === "error" && (
                          <div className="absolute right-1 top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-destructive text-white shadow-sm ring-1 ring-white">
                            <AlertCircle className="h-3 w-3" />
                          </div>
                        )}
                      </div>

                      {/* Nome do arquivo e métricas simplificadas */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground tracking-tight" title={image.file.name}>
                            {image.file.name}
                          </p>
                        </div>

                        {/* Detalhes de tamanho e dimensões em fluxo linear */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {image.status === "done" && image.compressedBlob ? (
                            <>
                              <span className="font-medium">{formatBytes(image.file.size)}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/45" />
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatBytes(image.compressedBlob.size)}
                              </span>
                              {reduction !== undefined && (
                                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  -{formatPercent(reduction)}
                                </span>
                              )}
                              <span className="text-muted-foreground/30">•</span>
                              <span className="text-muted-foreground/80">
                                {image.originalDimensions && `${image.originalDimensions.width}×${image.originalDimensions.height}`}
                                {image.originalDimensions && image.finalDimensions &&
                                  (image.originalDimensions.width !== image.finalDimensions.width ||
                                    image.originalDimensions.height !== image.finalDimensions.height) && (
                                    <>
                                      {" ➔ "}
                                      <span className="font-medium text-foreground/85">
                                        {image.finalDimensions.width}×{image.finalDimensions.height}px
                                      </span>
                                    </>
                                  )}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{formatBytes(image.file.size)}</span>
                              {image.originalDimensions && (
                                <>
                                  <span className="text-muted-foreground/30">•</span>
                                  <span>{image.originalDimensions.width}×{image.originalDimensions.height}px</span>
                                </>
                              )}
                              <span className="text-muted-foreground/30">•</span>
                              <span className={cn(
                                "inline-flex items-center gap-1 font-medium",
                                image.status === "processing" && "text-primary",
                                image.status === "error" && "text-destructive",
                                image.status === "pending" && "text-muted-foreground"
                              )}>
                                {image.status === "processing" && <LoaderCircle className="h-3 w-3 animate-spin" />}
                                {status.label}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Notificações de erro ou caminho de salvamento inline */}
                        {(image.error || image.downloadError) && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="font-medium">{image.error || image.downloadError}</span>
                          </div>
                        )}

                        {image.savedPath && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1" title={image.savedPath}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            <span>Salvo em: <span className="font-medium text-foreground">{image.savedPath}</span></span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bloco da direita: Ações de controle */}
                    <div className="flex items-center justify-end gap-1.5 flex-shrink-0 self-end sm:self-center">
                      <Button
                        variant={isPreviewOpen ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-8 gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors",
                          isPreviewOpen
                            ? "bg-secondary text-secondary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewId(isPreviewOpen ? null : image.id);
                        }}
                        aria-label="Visualizar comparação"
                      >
                        <ScanSearch className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Comparar</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasCompressed}
                        className="h-8 gap-1 rounded-lg px-2.5 text-xs font-semibold shadow-sm border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 hover:text-emerald-700 disabled:bg-muted/50 disabled:text-muted-foreground/50 disabled:border-transparent"
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
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Baixar</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isProcessing}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(image.id);
                          if (isPreviewOpen) {
                            setPreviewId(null);
                          }
                        }}
                        aria-label="Remover imagem"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isPreviewOpen && (
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
                              : "Compacte a imagem para visualizar a comparação."}
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
                  )}
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
